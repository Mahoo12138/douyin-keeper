import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { withdrawalStatus } from "../../constants";

export { withdrawalStatus };

export const withdrawal = sqliteTable("withdrawal", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentMethod: text("payment_method").notNull(),
  paymentAccount: text("payment_account").notNull(),
  status: text("status").notNull().default(withdrawalStatus.PENDING),
  adminNote: text("admin_note"),
  processedAt: integer("processed_at", { mode: 'timestamp' }),
  processedBy: text("processed_by"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type Withdrawal = InferSelectModel<typeof withdrawal>;
export type NewWithdrawal = InferInsertModel<typeof withdrawal>;
