import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { planDurationTypes } from "../../constants";

export { planDurationTypes };

export const pricingPlan = sqliteTable("pricing_plan", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  amount: text("amount").notNull(),
  originalPrice: text("original_price"),
  currency: text("currency").notNull(),
  durationType: text("duration_type").notNull(),
  durationMonths: integer("duration_months"),
  credits: integer("credits"),
  recommended: integer("recommended", { mode: 'boolean' }).default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
  locales: text("locales", { mode: 'json' }).$type<string[] | null>(),
  stripePriceId: text("stripe_price_id"),
  paypalPlanId: text("paypal_plan_id"),
  creemProductId: text("creem_product_id"),
  dodoProductId: text("dodo_product_id"),
  i18n: text("i18n", { mode: 'json' }).notNull().$type<Record<string, { name: string; description: string; duration?: string; features?: string | string[] }>>(),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type PricingPlan = InferSelectModel<typeof pricingPlan>;
export type NewPricingPlan = InferInsertModel<typeof pricingPlan>;
