import { config } from '@config';
import {
  PaymentProvider,
  PaymentParams,
  PaymentResult,
  WebhookVerification,
  OrderQueryResult,
  PaymentPlan
} from '../types';
import { db } from '@libs/database';
import {
  subscription as userSubscription,
  subscriptionStatus,
  paymentTypes
} from '@libs/database/schema/subscription';
import { order, orderStatus } from '@libs/database/schema/order';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { utcNow } from '@libs/database/utils/utc';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { processReferralCommission } from '@libs/affiliate';
import { getPlanById } from '@libs/pricing';

// PayPal API Response Types
interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

interface PayPalSubscription {
  id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  status_update_time?: string;
  plan_id: string;
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
    last_payment?: {
      amount: {
        currency_code: string;
        value: string;
      };
      time: string;
    };
    cycle_executions?: Array<{
      tenure_type: string;
      sequence: number;
      cycles_completed: number;
      cycles_remaining: number;
      current_pricing_scheme_version: number;
      total_cycles: number;
    }>;
  };
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

// PayPal Webhook Event Types
interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  resource: {
    id: string;
    status?: string;
    custom_id?: string;
    billing_agreement_id?: string;
    start_time?: string;
    plan_id?: string;
    billing_info?: {
      next_billing_time?: string;
      last_payment?: {
        amount: {
          currency_code: string;
          value: string;
        };
        time: string;
      };
    };
    purchase_units?: Array<{
      reference_id?: string;
      custom_id?: string;
    }>;
    [key: string]: any;
  };
  summary?: string;
}

interface PayPalSignatureData {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

export class PayPalProvider implements PaymentProvider {
  private clientId: string;
  private clientSecret: string;
  private webhookId: string;
  private apiBaseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = config.payment.providers.paypal.clientId;
    this.clientSecret = config.payment.providers.paypal.clientSecret;
    this.webhookId = config.payment.providers.paypal.webhookId;
    this.apiBaseUrl = config.payment.providers.paypal.apiBaseUrl;
  }

  /**
   * Get PayPal access token for API calls
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(`${this.apiBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get PayPal access token: ${error}`);
    }

    const data = await response.json();
    const accessToken = data.access_token as string;
    this.accessToken = accessToken;
    // Set expiry 5 minutes before actual expiry for safety
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    
    return accessToken;
  }

  /**
   * Create a payment (one-time or subscription)
   */
  async createPayment(params: PaymentParams): Promise<PaymentResult> {
    const plan = params.plan || config.payment.plans[params.planId as keyof typeof config.payment.plans] as PaymentPlan;
    if (!plan) {
      throw new Error(`Plan not found: ${params.planId}`);
    }
    
    if (plan.duration.type === 'recurring') {
      return this.createSubscription(params, plan);
    } else {
      // Both 'one_time' and 'credits' use the same payment mode
      return this.createOneTimePayment(params, plan);
    }
  }

  /**
   * Create a one-time payment order
   */
  private async createOneTimePayment(params: PaymentParams, plan: PaymentPlan): Promise<PaymentResult> {
    const accessToken = await this.getAccessToken();

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: params.orderId,
        custom_id: JSON.stringify({
          orderId: params.orderId,
          userId: params.userId,
          planId: params.planId
        }),
        amount: {
          currency_code: plan.currency,
          value: plan.amount.toFixed(2)
        },
        description: `Order ${params.orderId}`
      }],
      application_context: {
        return_url: `${config.app.baseUrl}/api/payment/return/paypal?order_id=${params.orderId}`,
        cancel_url: config.app.payment.cancelUrl,
        brand_name: config.app.name || 'ShipEasy',
        user_action: 'PAY_NOW'
      }
    };

    const response = await fetch(`${this.apiBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('PayPal order creation failed:', error);
      throw new Error(`Failed to create PayPal order: ${error}`);
    }

    const order: PayPalOrder = await response.json();
    
    // Find the approve URL
    const approveLink = order.links?.find(link => link.rel === 'approve');
    if (!approveLink) {
      throw new Error('No approve URL found in PayPal response');
    }

    return {
      paymentUrl: approveLink.href,
      providerOrderId: order.id,
      metadata: {
        orderId: params.orderId,
        paypalOrderId: order.id
      }
    };
  }

  /**
   * Create a subscription
   * Note: Plan must be pre-created in PayPal Dashboard
   */
  private async createSubscription(params: PaymentParams, plan: PaymentPlan): Promise<PaymentResult> {
    if (!plan.paypalPlanId) {
      throw new Error(`PayPal plan ID not configured for plan: ${params.planId}`);
    }
    const accessToken = await this.getAccessToken();

    const subscriptionData = {
      plan_id: plan.paypalPlanId,
      custom_id: JSON.stringify({
        orderId: params.orderId,
        userId: params.userId,
        planId: params.planId
      }),
      application_context: {
        return_url: `${config.app.baseUrl}/api/payment/return/paypal?order_id=${params.orderId}&subscription=true`,
        cancel_url: config.app.payment.cancelUrl,
        brand_name: config.app.name || 'TinyShip',
        user_action: 'SUBSCRIBE_NOW'
      }
    };

    const response = await fetch(`${this.apiBaseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(subscriptionData)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('PayPal subscription creation failed:', error);
      throw new Error(`Failed to create PayPal subscription: ${error}`);
    }

    const subscription: PayPalSubscription = await response.json();
    
    // Find the approve URL
    const approveLink = subscription.links?.find(link => link.rel === 'approve');
    if (!approveLink) {
      throw new Error('No approve URL found in PayPal subscription response');
    }

    return {
      paymentUrl: approveLink.href,
      providerOrderId: subscription.id,
      metadata: {
        orderId: params.orderId,
        paypalSubscriptionId: subscription.id,
        planId: subscription.plan_id
      }
    };
  }

  /**
   * Capture a payment after user approval
   * Called from the success callback after user approves the payment
   */
  async captureOrder(paypalOrderId: string): Promise<PayPalOrder> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${this.apiBaseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('PayPal capture failed:', error);
      throw new Error(`Failed to capture PayPal order: ${error}`);
    }

    return await response.json();
  }

  /**
   * Handle webhook events from PayPal
   */
  async handleWebhook(payload: string | Record<string, any>, signature: string): Promise<WebhookVerification> {
    try {
      const payloadString = typeof payload === 'string'
        ? payload
        : JSON.stringify(payload);

      let signatureData: PayPalSignatureData | null = null;
      try {
        signatureData = JSON.parse(signature) as PayPalSignatureData;
      } catch {
        console.error('Invalid PayPal signature payload');
      }

      if (!signatureData?.transmissionId || !signatureData.transmissionSig) {
        console.error('Missing PayPal webhook signature data');
        return { success: false };
      }

      const isVerified = await this.verifyWebhookSignature(payloadString, signatureData);
      if (!isVerified) {
        console.error('PayPal webhook signature verification failed');
        return { success: false };
      }

      const webhookEvent: PayPalWebhookEvent = JSON.parse(payloadString);
      console.log('PayPal webhook received:', webhookEvent.event_type);

      switch (webhookEvent.event_type) {
        // One-time payment events
        case 'PAYMENT.CAPTURE.COMPLETED':
          return this.handlePaymentCaptureCompleted(webhookEvent);

        case 'PAYMENT.CAPTURE.DENIED':
        case 'PAYMENT.CAPTURE.REFUNDED':
          return this.handlePaymentCaptureFailed(webhookEvent);

        // Subscription events
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          return this.handleSubscriptionActivated(webhookEvent);

        case 'BILLING.SUBSCRIPTION.UPDATED':
          return this.handleSubscriptionUpdated(webhookEvent);

        case 'BILLING.SUBSCRIPTION.CANCELLED':
          return this.handleSubscriptionCancelled(webhookEvent);

        case 'BILLING.SUBSCRIPTION.EXPIRED':
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
          return this.handleSubscriptionExpired(webhookEvent);

        case 'PAYMENT.SALE.COMPLETED':
          // Subscription payment completed (recurring payment)
          return this.handleSubscriptionPaymentCompleted(webhookEvent);

        default:
          console.log(`Unhandled PayPal webhook event: ${webhookEvent.event_type}`);
          return { success: true };
      }
    } catch (error) {
      console.error('Error handling PayPal webhook:', error);
      return { success: false };
    }
  }

  /**
   * Verify PayPal webhook signature
   */
  private async verifyWebhookSignature(payload: string, signatureData: PayPalSignatureData): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();

      const verificationPayload = {
        auth_algo: signatureData.authAlgo,
        cert_url: signatureData.certUrl,
        transmission_id: signatureData.transmissionId,
        transmission_sig: signatureData.transmissionSig,
        transmission_time: signatureData.transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: JSON.parse(payload)
      };

      const response = await fetch(`${this.apiBaseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verificationPayload)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('PayPal webhook verification API failed:', error);
        return false;
      }

      const result = await response.json();
      return result.verification_status === 'SUCCESS';
    } catch (error) {
      console.error('Error verifying PayPal webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle successful payment capture
   * Note: This may be called after the return handler already processed the order.
   * We check if order is already paid to avoid duplicate processing.
   */
  private async handlePaymentCaptureCompleted(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      // Extract custom_id from the resource
      let metadata: { orderId?: string; userId?: string; planId?: string } = {};
      
      if (event.resource.custom_id) {
        try {
          metadata = JSON.parse(event.resource.custom_id);
        } catch {
          console.error('Failed to parse custom_id:', event.resource.custom_id);
        }
      }

      if (!metadata.orderId || !metadata.userId || !metadata.planId) {
        console.error('Missing required metadata in PayPal webhook');
        return { success: false };
      }

      const { orderId, userId, planId } = metadata;

      // Check if order was already processed (by return handler)
      const existingOrder = await db.query.order.findFirst({
        where: eq(order.id, orderId)
      });

      if (existingOrder?.status === orderStatus.PAID) {
        console.log(`PayPal webhook: Order ${orderId} already paid, skipping duplicate processing`);
        return { success: true, orderId };
      }

      const plan = (await getPlanById(planId) || config.payment.plans[planId as keyof typeof config.payment.plans]) as PaymentPlan;

      const existingMetadata = (() => {
        if (!existingOrder?.metadata) {
          return {};
        }
        if (typeof existingOrder.metadata === 'object') {
          return existingOrder.metadata as Record<string, unknown>;
        }
        if (typeof existingOrder.metadata === 'string') {
          try {
            return JSON.parse(existingOrder.metadata) as Record<string, unknown>;
          } catch {
            return {};
          }
        }
        return {};
      })();

      // Update order status only if still pending to prevent double fulfillment
      const updatedOrders = await db.update(order)
        .set({ 
          status: orderStatus.PAID,
          metadata: {
            ...existingMetadata,
            paypalCaptureId: event.resource.id,
            processedBy: 'webhook'
          }
        })
        .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
        .returning({ id: order.id });

      if (updatedOrders.length === 0) {
        return { success: true, orderId };
      }

      await processReferralCommission(orderId);

      // Handle credit pack purchase
      if (plan.duration.type === 'credits' && plan.credits) {
        console.log(`PayPal credit pack purchase - Adding ${plan.credits} credits to user ${userId}`);
        
        await creditService.addCredits({
          userId: userId,
          amount: plan.credits,
          type: 'purchase',
          orderId: orderId,
          description: TransactionTypeCode.PURCHASE,
          metadata: {
            paypalCaptureId: event.resource.id,
            planId: planId,
            provider: 'paypal'
          }
        });

        return { success: true, orderId };
      }

      // Handle one-time subscription payment
      const now = utcNow();
      const months = plan.duration.months ?? 1;

      // Check if user already has active subscription for this plan
      const existingSubscription = await db.query.subscription.findFirst({
        where: and(
          eq(userSubscription.userId, userId),
          eq(userSubscription.planId, planId),
          eq(userSubscription.status, subscriptionStatus.ACTIVE)
        ),
        orderBy: [desc(userSubscription.periodEnd)]
      });

      if (existingSubscription) {
        // Extend existing subscription
        const existingPeriodEnd = existingSubscription.periodEnd;
        const extensionStart = existingPeriodEnd > now ? existingPeriodEnd : now;
        
        const extensionEnd = new Date(extensionStart);
        if (months >= 9999) {
          extensionEnd.setFullYear(extensionEnd.getFullYear() + 100);
        } else {
          extensionEnd.setMonth(extensionEnd.getMonth() + months);
        }
        
        console.log(`PayPal webhook: Extending subscription for user ${userId}, new end: ${extensionEnd.toISOString()}`);

        await db.update(userSubscription)
          .set({
            periodEnd: extensionEnd,
            updatedAt: now,
            metadata: JSON.stringify({
              ...JSON.parse(existingSubscription.metadata || '{}'),
              renewed: true,
              lastPaypalCaptureId: event.resource.id,
              lastOrderId: orderId,
              lastPaymentTime: now.toISOString(),
              isLifetime: months >= 9999,
              processedBy: 'webhook'
            })
          })
          .where(eq(userSubscription.id, existingSubscription.id));
      } else {
        // Create new subscription
        const periodEnd = new Date(now);
        if (months >= 9999) {
          periodEnd.setFullYear(periodEnd.getFullYear() + 100);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + months);
        }
        
        console.log(`PayPal webhook: Creating subscription for user ${userId}, period: ${now.toISOString()} to ${periodEnd.toISOString()}`);

        await db.insert(userSubscription).values({
          id: randomUUID(),
          userId: userId,
          planId: planId,
          status: subscriptionStatus.ACTIVE,
          paymentType: paymentTypes.ONE_TIME,
          periodStart: now,
          periodEnd: periodEnd,
          cancelAtPeriodEnd: true,
          metadata: JSON.stringify({
            paypalCaptureId: event.resource.id,
            orderId: orderId,
            isLifetime: months >= 9999,
            processedBy: 'webhook'
          })
        });
      }

      return { success: true, orderId };
    } catch (error) {
      console.error('Error handling payment capture completed:', error);
      return { success: false };
    }
  }

  /**
   * Handle failed payment capture
   */
  private async handlePaymentCaptureFailed(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      let metadata: { orderId?: string } = {};
      
      if (event.resource.custom_id) {
        try {
          metadata = JSON.parse(event.resource.custom_id);
        } catch {
          console.error('Failed to parse custom_id');
        }
      }

      if (metadata.orderId) {
        await db.update(order)
          .set({ status: orderStatus.FAILED })
          .where(eq(order.id, metadata.orderId));
      }

      return { success: true };
    } catch (error) {
      console.error('Error handling payment capture failed:', error);
      return { success: false };
    }
  }

  /**
   * Handle subscription activated
   */
  private async handleSubscriptionActivated(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      let metadata: { orderId?: string; userId?: string; planId?: string } = {};
      
      if (event.resource.custom_id) {
        try {
          metadata = JSON.parse(event.resource.custom_id);
        } catch {
          console.error('Failed to parse custom_id');
        }
      }

      if (!metadata.orderId || !metadata.userId || !metadata.planId) {
        console.error('Missing required metadata in subscription activated webhook');
        return { success: false };
      }

      const { orderId, userId, planId } = metadata;

      const now = utcNow();

      // Update order status only if still pending to prevent double fulfillment
      const updatedOrders = await db.update(order)
        .set({ status: orderStatus.PAID, updatedAt: now })
        .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
        .returning({ id: order.id });

      if (updatedOrders.length === 0) {
        return { success: true, orderId };
      }

      await processReferralCommission(orderId);

      // Calculate subscription period
      let periodEnd = new Date(now);
      
      // Try to get billing info from the subscription
      if (event.resource.billing_info?.next_billing_time) {
        periodEnd = new Date(event.resource.billing_info.next_billing_time);
      } else {
        // Fallback: calculate based on plan config
        const plan = (await getPlanById(planId) || config.payment.plans[planId as keyof typeof config.payment.plans]) as PaymentPlan;
        const months = plan.duration.months ?? 1;
        periodEnd.setMonth(periodEnd.getMonth() + months);
      }

      console.log(`PayPal subscription activated - Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);

      const paypalSubscriptionId = event.resource.id;
      if (!paypalSubscriptionId) {
        console.error('Missing PayPal subscription id in activated webhook');
        return { success: false };
      }

      const existingSubscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.paypalSubscriptionId, paypalSubscriptionId)
      });

      if (existingSubscription) {
        await db.update(userSubscription)
          .set({
            status: subscriptionStatus.ACTIVE,
            periodStart: now,
            periodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            updatedAt: now,
            metadata: JSON.stringify({
              ...JSON.parse(existingSubscription.metadata || '{}'),
              paypalPlanId: event.resource.plan_id,
              processedBy: 'webhook'
            })
          })
          .where(eq(userSubscription.id, existingSubscription.id));
      } else {
        await db.insert(userSubscription).values({
          id: randomUUID(),
          userId: userId,
          planId: planId,
          status: subscriptionStatus.ACTIVE,
          paymentType: paymentTypes.RECURRING,
          paypalSubscriptionId: paypalSubscriptionId,
          periodStart: now,
          periodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          metadata: JSON.stringify({
            paypalPlanId: event.resource.plan_id,
            processedBy: 'webhook'
          })
        });
      }

      return { success: true, orderId };
    } catch (error) {
      console.error('Error handling subscription activated:', error);
      return { success: false };
    }
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      const paypalSubscriptionId = event.resource.id;
      
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.paypalSubscriptionId, paypalSubscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for PayPal subscription ${paypalSubscriptionId}`);
        return { success: true }; // Don't fail, might be a new subscription
      }

      // Update subscription based on new status
      const status = event.resource.status;
      let newStatus = subscription.status;
      
      if (status === 'ACTIVE') {
        newStatus = subscriptionStatus.ACTIVE;
      } else if (status === 'SUSPENDED') {
        newStatus = subscriptionStatus.INACTIVE;
      } else if (status === 'CANCELLED') {
        newStatus = subscriptionStatus.CANCELED;
      }

      const now = utcNow();
      await db.update(userSubscription)
        .set({
          status: newStatus,
          updatedAt: now
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription updated:', error);
      return { success: false };
    }
  }

  /**
   * Handle subscription cancelled
   */
  private async handleSubscriptionCancelled(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      const paypalSubscriptionId = event.resource.id;
      
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.paypalSubscriptionId, paypalSubscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for PayPal subscription ${paypalSubscriptionId}`);
        return { success: true };
      }

      // Mark subscription to cancel at period end (user can still use until period ends)
      const now = utcNow();
      await db.update(userSubscription)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: now
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription cancelled:', error);
      return { success: false };
    }
  }

  /**
   * Handle subscription expired or suspended
   */
  private async handleSubscriptionExpired(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      const paypalSubscriptionId = event.resource.id;
      
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.paypalSubscriptionId, paypalSubscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for PayPal subscription ${paypalSubscriptionId}`);
        return { success: true };
      }

      const now = utcNow();
      await db.update(userSubscription)
        .set({
          status: subscriptionStatus.EXPIRED,
          updatedAt: now
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription expired:', error);
      return { success: false };
    }
  }

  /**
   * Handle subscription payment completed (recurring billing)
   */
  private async handleSubscriptionPaymentCompleted(event: PayPalWebhookEvent): Promise<WebhookVerification> {
    try {
      // For subscription payments, billing_agreement_id contains the subscription ID
      const paypalSubscriptionId = event.resource.billing_agreement_id;
      
      if (!paypalSubscriptionId) {
        console.warn('No billing_agreement_id in subscription payment event');
        return { success: true };
      }

      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.paypalSubscriptionId, paypalSubscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for PayPal subscription ${paypalSubscriptionId}`);
        return { success: true }; // First payment might be handled by SUBSCRIPTION.ACTIVATED
      }

      // Get subscription details to update period
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${this.apiBaseUrl}/v1/billing/subscriptions/${paypalSubscriptionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const subscriptionDetails: PayPalSubscription = await response.json();
        
        let periodEnd = subscription.periodEnd;
        if (subscriptionDetails.billing_info?.next_billing_time) {
          periodEnd = new Date(subscriptionDetails.billing_info.next_billing_time);
        }

        const now = utcNow();
        await db.update(userSubscription)
          .set({
            status: subscriptionStatus.ACTIVE,
            periodStart: now,
            periodEnd: periodEnd,
            updatedAt: now
          })
          .where(eq(userSubscription.id, subscription.id));
      }

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription payment completed:', error);
      return { success: false };
    }
  }

  /**
   * Get subscription details from PayPal
   */
  async getSubscription(subscriptionId: string): Promise<PayPalSubscription | null> {
    try {
      const accessToken = await this.getAccessToken();
      
      const response = await fetch(`${this.apiBaseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting PayPal subscription:', error);
      return null;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, reason: string = 'Cancelled by user'): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();
      
      const response = await fetch(`${this.apiBaseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      return response.ok || response.status === 204;
    } catch (error) {
      console.error('Error cancelling PayPal subscription:', error);
      return false;
    }
  }

  /**
   * Close an order (void unpaid order)
   */
  async closeOrder(orderId: string): Promise<boolean> {
    // PayPal orders automatically expire after a period
    // We just update our database status
    try {
      await db.update(order)
        .set({ status: orderStatus.FAILED })
        .where(eq(order.id, orderId));
      return true;
    } catch (error) {
      console.error('Error closing PayPal order:', error);
      return false;
    }
  }

  /**
   * Query order status
   */
  async queryOrder(orderId: string): Promise<OrderQueryResult> {
    try {
      const orderRecord = await db.query.order.findFirst({
        where: eq(order.id, orderId)
      });

      if (!orderRecord) {
        return { status: 'failed' };
      }

      if (orderRecord.status === orderStatus.PAID) {
        return { status: 'paid' };
      } else if (orderRecord.status === orderStatus.FAILED) {
        return { status: 'failed' };
      } else {
        return { status: 'pending' };
      }
    } catch (error) {
      console.error('Error querying PayPal order:', error);
      return { status: 'failed' };
    }
  }
}
