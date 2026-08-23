import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { subscriptionStatus, paymentTypes } from "../../constants";

export { subscriptionStatus, paymentTypes };

export const subscription = sqliteTable("subscription", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  paymentType: text("payment_type").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  creemCustomerId: text("creem_customer_id"),
  creemSubscriptionId: text("creem_subscription_id"),
  paypalSubscriptionId: text("paypal_subscription_id"),
  dodoCustomerId: text("dodo_customer_id"),
  dodoSubscriptionId: text("dodo_subscription_id"),
  periodStart: integer("period_start", { mode: 'timestamp' }).notNull(),
  periodEnd: integer("period_end", { mode: 'timestamp' }).notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: 'boolean' }).default(false),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
