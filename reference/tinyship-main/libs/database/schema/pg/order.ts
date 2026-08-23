import { pgTable, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { user } from "./user";
import { orderStatus, paymentProviders } from "../../constants";

export { orderStatus, paymentProviders };

export const order = pgTable("order", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  providerOrderId: text("provider_order_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
