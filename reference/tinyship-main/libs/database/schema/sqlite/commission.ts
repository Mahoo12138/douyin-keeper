import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { order } from "./order";
import { commissionStatus } from "../../constants";

export { commissionStatus };

export const commission = sqliteTable("commission", {
  id: text("id").primaryKey(),
  referrerId: text("referrer_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  orderId: text("order_id").notNull().references(() => order.id, { onDelete: 'cascade' }).unique(),
  buyerId: text("buyer_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  orderAmount: text("order_amount").notNull(),
  currency: text("currency").notNull(),
  commissionRate: text("commission_rate").notNull(),
  commissionAmount: text("commission_amount").notNull(),
  status: text("status").notNull().default(commissionStatus.CREDITED),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type Commission = InferSelectModel<typeof commission>;
export type NewCommission = InferInsertModel<typeof commission>;
