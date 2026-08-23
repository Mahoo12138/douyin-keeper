import { Creem } from 'creem';
import { config } from '@config';
import type { CreditPlan } from '@config';
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
import { user } from '@libs/database/schema/user';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { utcNow } from '@libs/database/utils/utc';
import { sha256Hex, hmacSha256Hex } from '../utils/web-crypto';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { processReferralCommission } from '@libs/affiliate';
import { getPlanById } from '@libs/pricing';

// Creem Return URL 参数接口
export interface CreemRedirectParams {
  request_id?: string | null;
  checkout_id?: string | null;
  order_id?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  product_id?: string | null;
  signature?: string | null;
}

// Return URL 验证结果
export interface ReturnUrlVerification {
  isValid: boolean;
  params?: CreemRedirectParams;
  error?: string;
}

// Creem Webhook 数据类型定义
export interface CreemWebhookEvent {
  id: string;
  eventType: 'checkout.completed' | 'subscription.active' | 'subscription.paid' | 'subscription.canceled' | 'subscription.expired' | 'subscription.update' | 'subscription.trialing' | 'refund.created';
  created_at: number;
  object: CreemWebhookObject;
}

export interface CreemWebhookObject {
  id: string;
  object: 'checkout' | 'subscription';
  request_id?: string;
  order?: CreemOrder;
  product?: CreemProduct | string;
  customer?: CreemCustomer | string;
  subscription?: CreemSubscription;
  // 当 object 为 'subscription' 时，周期信息直接在这个级别
  collection_method?: 'charge_automatically';
  status?: 'completed' | 'pending' | 'failed' | 'active' | 'canceled' | 'past_due' | 'unpaid';
  last_transaction_id?: string;
  last_transaction_date?: string;
  next_transaction_date?: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  custom_fields?: any[];
  metadata?: {
    orderId?: string;
    userId?: string;
    planId?: string;
    [key: string]: any;
  };
  mode?: 'test' | 'live' | 'local';
}

export interface CreemOrder {
  id: string;
  customer: string;
  product: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  type: 'recurring' | 'one_time';
  created_at: string;
  updated_at: string;
  mode: 'test' | 'live' | 'local';
}

export interface CreemProduct {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  price: number;
  currency: string;
  billing_type: 'recurring' | 'one_time';
  billing_period?: string;
  status: 'active' | 'inactive';
  tax_mode: 'inclusive' | 'exclusive';
  tax_category: string;
  default_success_url: string;
  created_at: string;
  updated_at: string;
  mode: 'test' | 'live' | 'local';
}

export interface CreemCustomer {
  id: string;
  object: 'customer';
  email: string;
  name?: string;
  country?: string;
  created_at: string;
  updated_at: string;
  mode: 'test' | 'live' | 'local';
}

export interface CreemSubscription {
  id: string;
  object: 'subscription';
  product: string | CreemProduct;
  customer: string | CreemCustomer;
  collection_method: 'charge_automatically';
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  last_transaction_id?: string;
  last_transaction_date?: string;
  next_transaction_date?: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: {
    [key: string]: any;
  };
  mode: 'test' | 'live' | 'local';
}

export class CreemProvider implements PaymentProvider {
  private creem: Creem;
  private apiKey: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = config.payment.providers.creem.apiKey;
    this.webhookSecret = config.payment.providers.creem.webhookSecret;
    
    this.creem = new Creem({
      serverURL: config.payment.providers.creem.serverUrl
    });
  }

  async createPayment(params: PaymentParams): Promise<PaymentResult> {
    const plan = params.plan || config.payment.plans[params.planId as keyof typeof config.payment.plans] as PaymentPlan;
    if (!plan) {
      throw new Error(`Plan not found: ${params.planId}`);
    }
    if (!plan.creemProductId) {
      throw new Error(`Creem product ID not configured for plan: ${params.planId}`);
    }
    
    // 获取或创建客户
    const customer = await this.getOrCreateCustomer(params.userId);
    
    try {
      // 使用官方 Creem SDK 创建 checkout
      // 基于 MCP 工具的结构，使用正确的参数格式
      // 注意：Creem API 不允许同时指定 customer.id 和 customer.email
      const checkoutData = {
        productId: plan.creemProductId,
        customer: customer.customerId ? {
          id: customer.customerId
        } : {
          email: customer.email
        },
        successUrl: `${config.app.payment.successUrl}?provider=creem`,
        metadata: {
          orderId: params.orderId,
          userId: params.userId,
          planId: params.planId
        }
      };


      const checkoutResult = await this.creem.createCheckout({
        xApiKey: this.apiKey,
        createCheckoutRequest: checkoutData
      });

      // 检查响应格式
      if (!checkoutResult?.checkoutUrl) {
        throw new Error('Failed to create Creem checkout session: No URL returned');
      }
      return {
        paymentUrl: checkoutResult.checkoutUrl,
        providerOrderId: checkoutResult.id, // 使用 checkout ID 作为 provider order ID
        metadata: {
          customerId: customer.customerId,
          checkoutId: checkoutResult.id,
          productId: checkoutResult.product,
          units: checkoutResult.units,
          mode: checkoutResult.mode
        }
      };
    } catch (error) {
      console.error('Creem payment creation failed:', error);
      throw new Error(`Failed to create Creem payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleWebhook(payload: string | Record<string, any>, signature: string): Promise<WebhookVerification> {
    try {
      // 将 payload 转换为字符串进行签名验证
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      
      // 验证 webhook 签名
      if (!(await this.verifyWebhookSignature(payloadString, signature))) {
        console.error('Invalid Creem webhook signature');
        return { success: false };
      }

      const webhookData: CreemWebhookEvent = typeof payload === 'string' ? JSON.parse(payload) : payload;
      
      // 基于事件类型处理 - 采用 Stripe 的简洁模式
      switch (webhookData.eventType) {
        case 'checkout.completed': {
          // 主要事件：处理所有新订单/订阅创建逻辑
          return this.handleCheckoutCompleted(webhookData);
        }
        case 'subscription.paid': {
          // 续费事件：处理订阅续费（非首次付款）
          return this.handleSubscriptionRenewal(webhookData);
        }
        case 'subscription.update': {
          // 订阅变更：处理计划升级/降级等
          return this.handleSubscriptionUpdate(webhookData);
        }
        case 'subscription.canceled': {
          // 订阅取消
          return this.handleSubscriptionCanceled(webhookData);
        }
        case 'subscription.expired': {
          // 订阅过期
          return this.handleSubscriptionExpired(webhookData);
        }
        case 'subscription.active': {
          // 仅用于同步，不进行业务逻辑处理
          console.log('Subscription activated (sync only):', webhookData.object.id);
          return { success: true };
        }
        default:
          console.log(`Unhandled Creem webhook event: ${webhookData.eventType}`);
          return { success: true };
      }
    } catch (error) {
      console.error('Error handling Creem webhook:', error);
      return { success: false };
    }
  }

  private async handleCheckoutCompleted(webhookData: CreemWebhookEvent): Promise<WebhookVerification> {
    
    // 修正数据结构：实际结构是 webhookData.object.metadata，不是 webhookData.data.metadata
    if (!webhookData.object?.metadata?.orderId) {
      console.error('Missing orderId in webhook metadata');
      return { success: false };
    }

    const { orderId, userId, planId } = webhookData.object.metadata;
    
    if (!orderId || !userId || !planId) {
      console.error('Missing required metadata in webhook:', { orderId, userId, planId });
      return { success: false };
    }
    
    const plan = (await getPlanById(planId) || config.payment.plans[planId as keyof typeof config.payment.plans]) as PaymentPlan;
    
    // Webhook 是权威的订单状态更新源，直接更新
    await db.update(order)
      .set({ 
        status: orderStatus.PAID,
        metadata: JSON.stringify({
          checkoutId: webhookData.object.id
        })
      })
      .where(eq(order.id, orderId));

    await processReferralCommission(orderId);

    // Handle credit pack purchase
    if (plan.duration.type === 'credits' && plan.credits) {
      console.log(`Creem credit pack purchase - Adding ${plan.credits} credits to user ${userId}`);
      
      await creditService.addCredits({
        userId: userId,
        amount: plan.credits,
        type: 'purchase',
        orderId: orderId,
        description: TransactionTypeCode.PURCHASE,
        metadata: {
          checkoutId: webhookData.object.id,
          planId: planId,
          provider: 'creem'
        }
      });

      return { success: true, orderId };
    }

    if (plan.duration.type === 'recurring') {
      // Handle recurring subscription
      let periodStart: Date;
      let periodEnd: Date;
      
      if (webhookData.object.subscription?.current_period_start_date && webhookData.object.subscription?.current_period_end_date) {
        // Use Creem provided period dates (ISO string to UTC)
        periodStart = new Date(webhookData.object.subscription.current_period_start_date);
        periodEnd = new Date(webhookData.object.subscription.current_period_end_date);
        console.log(`Using Creem provided period dates - Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
      } else {
        // Fallback: calculate period based on current time and plan config
        const now = utcNow();
        const months = plan.duration.months ?? 1;
        periodStart = now;
        periodEnd = new Date(now);
        if (months >= 9999) {
          periodEnd.setFullYear(periodEnd.getFullYear() + 100);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + months);
        }
        console.log(`Using calculated period dates - Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
      }

      const subscriptionData = {
        id: randomUUID(),
        userId: userId,
        planId: planId,
        status: subscriptionStatus.ACTIVE,
        paymentType: paymentTypes.RECURRING,
        creemCustomerId: typeof webhookData.object.customer === 'string' 
          ? webhookData.object.customer 
          : webhookData.object.customer?.id || null,
        creemSubscriptionId: webhookData.object.subscription?.id || null,
        periodStart: periodStart,
        periodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        metadata: JSON.stringify({
          checkoutId: webhookData.object.id
        })
      };
      await db.insert(userSubscription).values(subscriptionData);
    } else {
      // Handle one-time payment
      const now = utcNow();
      const months = plan.duration.months ?? 1;
      const periodEnd = new Date(now);
      if (months >= 9999) {
        // Lifetime subscription: set to 100 years
        periodEnd.setFullYear(periodEnd.getFullYear() + 100);
      } else {
        // Regular subscription: add months
        periodEnd.setMonth(periodEnd.getMonth() + months);
      }
      
      console.log(`Creem one-time payment - Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);

      const oneTimeSubscriptionData = {
        id: randomUUID(),
        userId: userId,
        planId: planId,
        status: subscriptionStatus.ACTIVE,
        paymentType: paymentTypes.ONE_TIME,
        creemCustomerId: typeof webhookData.object.customer === 'string' 
          ? webhookData.object.customer 
          : webhookData.object.customer?.id || null,
        periodStart: now,
        periodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        metadata: JSON.stringify({
          checkoutId: webhookData.object.id,
          isLifetime: months >= 9999
        })
      };
      await db.insert(userSubscription).values(oneTimeSubscriptionData);
    }

    return { success: true, orderId };
  }



  private async handleSubscriptionRenewal(webhookData: CreemWebhookEvent): Promise<WebhookVerification> {
    // subscription.paid: 订阅续费成功（非首次付款）
    // 只处理续费，首次付款在 checkout.completed 中处理
    try {
      const subscriptionId = webhookData.object.id;
      
      if (!subscriptionId) {
        console.warn('No subscription ID found in webhook data');
        return { success: false };
      }
      
      // 根据Creem订阅ID查找本地订阅记录
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.creemSubscriptionId, subscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for Creem subscription ${subscriptionId} - this might be a first payment, will be handled by checkout.completed`);
        return { success: true }; // 不报错，可能是首次付款
      }
      
    // 从Creem webhook获取准确的订阅周期信息（ISO字符串转UTC）
    const periodStartStr = webhookData.object.current_period_start_date;
    const periodEndStr = webhookData.object.current_period_end_date;
    
    if (!periodStartStr || !periodEndStr) {
      console.error('Missing period dates in Creem webhook:', { periodStartStr, periodEndStr });
      return { success: false };
    }
    
    const newPeriodStart = new Date(periodStartStr);
    const newPeriodEnd = new Date(periodEndStr);
    
    // 验证日期有效性
    if (isNaN(newPeriodStart.getTime()) || isNaN(newPeriodEnd.getTime())) {
      console.error('Invalid period dates from Creem webhook:', { periodStartStr, periodEndStr });
      return { success: false };
    }
    
    console.log(`Creem subscription renewal - Period: ${newPeriodStart.toISOString()} to ${newPeriodEnd.toISOString()}`);
      
      // 更新订阅状态为 ACTIVE（续费成功）并更新订阅周期
      await db.update(userSubscription)
        .set({
          status: subscriptionStatus.ACTIVE,
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
          updatedAt: new Date()
        })
        .where(eq(userSubscription.id, subscription.id));

      console.log(`Subscription renewal successful for ${subscriptionId}, new period: ${newPeriodStart.toISOString()} - ${newPeriodEnd.toISOString()}`);
      return { success: true };
    } catch (error) {
      console.error('Error handling subscription renewal:', error);
      return { success: false };
    }
  }

  private async handleSubscriptionUpdate(webhookData: CreemWebhookEvent): Promise<WebhookVerification> {
    try {
      // 根据文档，subscription 对象直接在 webhookData.object 中
      const subscriptionId = webhookData.object.id;
      
      if (!subscriptionId) {
        console.warn('No subscription ID found in webhook data');
        return { success: false };
      }
      
      // 根据Creem订阅ID查找本地订阅记录
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.creemSubscriptionId, subscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for Creem subscription ${subscriptionId}`);
        return { success: false };
      }
      
      // 更新订阅状态和周期
      await db.update(userSubscription)
        .set({
          status: this.mapCreemStatus(webhookData.object.status || 'active'),
          // cancelAtPeriodEnd: 根据具体的 webhook 数据结构决定
          updatedAt: new Date()
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription update:', error);
      return { success: false };
    }
  }

  private async handleSubscriptionCanceled(webhookData: CreemWebhookEvent): Promise<WebhookVerification> {
    try {
      const subscriptionId = webhookData.object.id;
      
      if (!subscriptionId) {
        console.warn('No subscription ID found in webhook data');
        return { success: false };
      }
      
      // 根据Creem订阅ID查找本地订阅记录
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.creemSubscriptionId, subscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for Creem subscription ${subscriptionId}`);
        return { success: false };
      }
      
      // 更新订阅状态为期末取消（保持active状态，用户仍可使用到期末）
      await db.update(userSubscription)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date()
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription cancellation:', error);
      return { success: false };
    }
  }

  private async handleSubscriptionExpired(webhookData: CreemWebhookEvent): Promise<WebhookVerification> {
    try {
      const subscriptionId = webhookData.object.id;
      
      if (!subscriptionId) {
        console.warn('No subscription ID found in webhook data');
        return { success: false };
      }
      
      // 根据Creem订阅ID查找本地订阅记录
      const subscription = await db.query.subscription.findFirst({
        where: eq(userSubscription.creemSubscriptionId, subscriptionId)
      });

      if (!subscription) {
        console.warn(`No local subscription found for Creem subscription ${subscriptionId}`);
        return { success: false };
      }
      
      // 更新订阅状态为过期
      await db.update(userSubscription)
        .set({
          status: subscriptionStatus.EXPIRED, // 使用 EXPIRED 表示订阅过期
          updatedAt: new Date()
        })
        .where(eq(userSubscription.id, subscription.id));

      return { success: true };
    } catch (error) {
      console.error('Error handling subscription expiration:', error);
      return { success: false };
    }
  }

  private mapCreemStatus(status: string): string {
    switch (status) {
      case 'active':
        return subscriptionStatus.ACTIVE;       // 活跃订阅
      case 'canceled':
        return subscriptionStatus.CANCELED;     // 用户主动取消
      case 'expired':
        return subscriptionStatus.EXPIRED;      // 订阅过期
      case 'past_due':
        return subscriptionStatus.EXPIRED;      // 付款逾期 → 统一为过期
      case 'unpaid':
        return subscriptionStatus.EXPIRED;      // 付款失败 → 统一为过期
      default:
        return subscriptionStatus.INACTIVE;     // 默认状态
    }
  }

  private async getOrCreateCustomer(userId: string): Promise<{ customerId: string; email: string }> {
    // 从用户表获取用户信息 - 使用与 Stripe 一致的查询方式
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, userId)
    });

    if (!userRecord) {
      throw new Error(`User not found: ${userId}`);
    }

    const email = userRecord.email;

    if (!email) {
      throw new Error(`User email not found for user: ${userId}`);
    }

    // 检查是否已有Creem客户记录
    if (userRecord.creemCustomerId) {
      return {
        customerId: userRecord.creemCustomerId,
        email: email
      };
    }

    // 尝试通过邮箱查找现有客户
    try {
      const customerResult = await this.creem.retrieveCustomer({
        xApiKey: this.apiKey,
        email: email
      });

      if (customerResult?.id) {
        // 更新用户表中的Creem客户ID
        await db.update(user)
          .set({ 
            creemCustomerId: customerResult.id,
            updatedAt: new Date()
          })
          .where(eq(user.id, userId));

        return {
          customerId: customerResult.id,
          email: email
        };
      }
    } catch (error) {
      // 客户不存在，继续创建新客户
      console.log('Customer not found in Creem, will create new one');
    }

    // 如果没有现有客户，Creem会在checkout时自动创建
    // 所以我们返回邮箱，让checkout过程处理客户创建
    return {
      customerId: '', // Creem将在checkout时创建
      email: email
    };
  }

  async queryOrder(orderId: string): Promise<OrderQueryResult> {
    try {
      // 从数据库获取订单的Creem checkout ID
      const orders = await db.select()
        .from(order)
        .where(eq(order.id, orderId));

      if (orders.length === 0) {
        return { status: 'failed' };
      }

      const orderData = orders[0];
      
      if (orderData.status === orderStatus.PAID) {
        return { status: 'paid' };
      } else if (orderData.status === orderStatus.FAILED) {
        return { status: 'failed' };
      } else {
        return { status: 'pending' };
      }
    } catch (error) {
      console.error('Error querying Creem order:', error);
      return { status: 'failed' };
    }
  }

  async closeOrder(orderId: string): Promise<boolean> {
    try {
      // 更新订单状态为已关闭
      await db.update(order)
        .set({ status: orderStatus.FAILED })
        .where(eq(order.id, orderId));

      return true;
    } catch (error) {
      console.error('Error closing Creem order:', error);
      return false;
    }
  }

  // Creem特有方法：创建客户门户链接
  async createCreemCustomerPortal(customerId: string, returnUrl: string) {
    try {
      const result = await this.creem.generateCustomerLinks({
        xApiKey: this.apiKey,
        createCustomerPortalLinkRequestEntity:{
          customerId
        } 
      });

      return {
        url: result?.customerPortalLink || returnUrl
      };
    } catch (error) {
      console.error('Error creating Creem customer portal:', error);
      throw error;
    }
  }

  /**
   * 验证 Creem Return URL 的签名
   * 根据 Creem 文档：https://docs.creem.io/learn/checkout-session/return-url
   */
  async verifyReturnUrl(urlString: string): Promise<ReturnUrlVerification> {
    try {
      const url = new URL(urlString);
      const params: CreemRedirectParams = {
        request_id: url.searchParams.get('request_id'),
        checkout_id: url.searchParams.get('checkout_id'),
        order_id: url.searchParams.get('order_id'),
        customer_id: url.searchParams.get('customer_id'),
        subscription_id: url.searchParams.get('subscription_id'),
        product_id: url.searchParams.get('product_id'),
        signature: url.searchParams.get('signature')
      };

      // 检查必需的参数
      if (!params.signature) {
        return {
          isValid: false,
          error: 'Missing signature parameter'
        };
      }

      if (!params.checkout_id || !params.order_id) {
        return {
          isValid: false,
          error: 'Missing required parameters (checkout_id or order_id)'
        };
      }

      // 生成预期的签名
      const expectedSignature = await this.generateSignature(params);

      // 验证签名
      const isValid = params.signature === expectedSignature;

      if (!isValid) {
        console.error('Signature verification failed for Creem return URL');
      }

      return {
        isValid,
        params: isValid ? params : undefined,
        error: isValid ? undefined : 'Invalid signature'
      };
    } catch (error) {
      console.error('Error parsing Creem return URL:', error);
      return {
        isValid: false,
        error: `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 根据 Creem 文档生成签名
   * 按照官方文档：https://docs.creem.io/learn/checkout-session/return-url
   * 直接使用文档中的方法
   */
  private async generateSignature(params: CreemRedirectParams): Promise<string> {
    // 按照文档示例，但需要排除 signature 参数和 null 值
    const data = Object.entries(params)
      .filter(([key, value]) => key !== 'signature' && value !== null && value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .concat(`salt=${this.apiKey}`)
      .join('|');

    return sha256Hex(data);
  }

  /**
   * 验证 Creem webhook 签名
   * 根据文档：https://docs.creem.io/learn/webhooks/verify-webhook-requests
   */
  private async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    try {
      const computedSignature = await hmacSha256Hex(this.webhookSecret, payload);
      return signature === computedSignature;
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * 处理成功支付后的重定向
   * 纯粹用于验证签名和用户体验，不处理任何业务逻辑
   * 所有订单状态更新完全由 webhook 处理
   */
  async handleSuccessRedirect(urlString: string): Promise<{
    success: boolean;
    params?: CreemRedirectParams;
    error?: string;
  }> {
    // 验证 Return URL 签名
    const verification = await this.verifyReturnUrl(urlString);
    
    if (!verification.isValid) {
      console.error('Invalid return URL signature:', verification.error);
      return {
        success: false,
        error: verification.error
      };
    }

    const params = verification.params!;

    try {
      // 可选：通过 Creem API 验证订单状态（仅用于用户体验）
      if (params.checkout_id) {
        const checkout = await this.creem.retrieveCheckout({
          xApiKey: this.apiKey,
          checkoutId: params.checkout_id
        });

        // 检查 checkout 状态
        if (checkout?.status !== 'completed') {
          return {
            success: false,
            error: 'Checkout not completed'
          };
        }
      }

      // 不进行任何数据库操作，完全依赖 webhook 处理
      console.log('Return URL verified successfully, waiting for webhook to process order');

      return {
        success: true,
        params
      };
    } catch (error) {
      console.error('Error handling success redirect:', error);
      return {
        success: false,
        error: `Failed to process redirect: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
