import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { user } from "./user";
import { withdrawalStatus } from "../../constants";

export { withdrawalStatus };

export const withdrawal = pgTable("withdrawal", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentMethod: text("payment_method").notNull(),
  paymentAccount: text("payment_account").notNull(),
  status: text("status").notNull().default(withdrawalStatus.PENDING),
  adminNote: text("admin_note"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processedBy: text("processed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Withdrawal = InferSelectModel<typeof withdrawal>;
export type NewWithdrawal = InferInsertModel<typeof withdrawal>;
