import { pgTable, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { user } from "./user";
import { subscriptionStatus, paymentTypes } from "../../constants";

export { subscriptionStatus, paymentTypes };

export const subscription = pgTable("subscription", {
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
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
