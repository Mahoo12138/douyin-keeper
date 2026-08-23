// User role constants that are safe to import on both client and server
export const userRoles = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserRole = typeof userRoles[keyof typeof userRoles];

// Order status constants
export const orderStatus = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELED: "canceled"
} as const;

// Payment provider constants
export const paymentProviders = {
  WECHAT: "wechat",
  STRIPE: "stripe",
  CREEM: "creem",
  PAYPAL: "paypal",
  DODO: "dodo",
} as const;

// Subscription status constants
export const subscriptionStatus = {
  ACTIVE: "active",
  CANCELED: "canceled",
  CANCELLED: "canceled",      // Alias for compatibility
  EXPIRED: "expired",
  TRIALING: "trialing",
  INACTIVE: "inactive"
} as const;

// Payment type constants
export const paymentTypes = {
  ONE_TIME: "one_time",
  RECURRING: "recurring"
} as const;

// Credit transaction type constants
export const creditTransactionTypes = {
  PURCHASE: "purchase",
  CONSUMPTION: "consumption",
  REFUND: "refund",
  BONUS: "bonus",
  ADJUSTMENT: "adjustment"
} as const;

// Commission status constants
export const commissionStatus = {
  PENDING: "pending",
  CREDITED: "credited",
  WITHDRAWN: "withdrawn",
  CANCELLED: "cancelled"
} as const;

// Withdrawal status constants
export const withdrawalStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  REJECTED: "rejected"
} as const;

// Plan duration type constants
export const planDurationTypes = {
  RECURRING: "recurring",
  ONE_TIME: "one_time",
  CREDITS: "credits",
} as const;

export type PlanDurationType = typeof planDurationTypes[keyof typeof planDurationTypes];

// Blog post status constants
export const blogPostStatus = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type BlogPostStatus = typeof blogPostStatus[keyof typeof blogPostStatus];
