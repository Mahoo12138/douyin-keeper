import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { user } from "./user";
import { order } from "./order";
import { commissionStatus } from "../../constants";

export { commissionStatus };

export const commission = pgTable("commission", {
  id: text("id").primaryKey(),
  referrerId: text("referrer_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  orderId: text("order_id").notNull().references(() => order.id, { onDelete: 'cascade' }).unique(),
  buyerId: text("buyer_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  orderAmount: numeric("order_amount").notNull(),
  currency: text("currency").notNull(),
  commissionRate: numeric("commission_rate").notNull(),
  commissionAmount: numeric("commission_amount").notNull(),
  status: text("status").notNull().default(commissionStatus.CREDITED),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Commission = InferSelectModel<typeof commission>;
export type NewCommission = InferInsertModel<typeof commission>;
