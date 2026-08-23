import Stripe from 'stripe';

export interface PaymentParams {
  planId: string;
  userId: string;
  orderId: string;
  amount?: number;
  currency?: string;
  plan?: PaymentPlan;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentUrl: string;
  providerOrderId: string;
  metadata?: Record<string, any>;
}

export interface PaymentPlan {
  id: string;
  amount: number;
  currency: string;
  duration: {
    type: 'recurring' | 'one_time' | 'credits';
    months?: number;
  };
  credits?: number;
  stripePriceId?: string;
  creemProductId?: string;
  paypalPlanId?: string;
  dodoProductId?: string;
}

export interface WebhookVerification {
  success: boolean;
  orderId?: string;
}

export interface PaymentProvider {
  createPayment(params: PaymentParams): Promise<PaymentResult>;
  handleWebhook(payload: string | Record<string, any>, signature: string): Promise<WebhookVerification>;
  // 关闭未支付的订单
  closeOrder?(orderId: string): Promise<boolean>;
  // Stripe 实例，用于访问 Stripe API（如客户门户）
  stripe?: Stripe;
  // 可选方法：创建客户门户会话（仅 Stripe 提供）
  createCustomerPortal?(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session>;
}

export interface OrderQueryResult {
  status: 'pending' | 'paid' | 'failed';
  metadata?: Record<string, any>;
}

// Stripe 扩展类型
export interface ExtendedStripeInvoice extends Stripe.Invoice {
  subscription: string;
  payment_intent?: string;
  amount_paid: number;
}

export interface ExtendedStripeSubscription extends Omit<Stripe.Subscription, 'items'> {
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{
      price: {
        id: string;
        unit_amount: number;
      }
    }>
  };
}

// Stripe specific types
export type StripeSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'unpaid';
export type StripeWebhookEvent = 
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'; 