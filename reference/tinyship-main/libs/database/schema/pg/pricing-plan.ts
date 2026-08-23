import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { planDurationTypes, paymentProviders } from "../../constants";

export { planDurationTypes };

export const pricingPlan = pgTable("pricing_plan", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  amount: numeric("amount").notNull(),
  originalPrice: numeric("original_price"),
  currency: text("currency").notNull(),
  durationType: text("duration_type").notNull(),
  durationMonths: integer("duration_months"),
  credits: integer("credits"),
  recommended: boolean("recommended").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  locales: jsonb("locales").$type<string[] | null>(),
  stripePriceId: text("stripe_price_id"),
  paypalPlanId: text("paypal_plan_id"),
  creemProductId: text("creem_product_id"),
  dodoProductId: text("dodo_product_id"),
  i18n: jsonb("i18n").notNull().$type<Record<string, { name: string; description: string; duration?: string; features?: string | string[] }>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PricingPlan = InferSelectModel<typeof pricingPlan>;
export type NewPricingPlan = InferInsertModel<typeof pricingPlan>;
