import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { orderStatus, paymentProviders } from "../../constants";

export { orderStatus, paymentProviders };

export const order = sqliteTable("order", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  providerOrderId: text("provider_order_id"),
  metadata: text("metadata", { mode: 'json' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
