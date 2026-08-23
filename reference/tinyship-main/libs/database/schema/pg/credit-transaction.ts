import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { user } from "./user";
import { creditTransactionTypes } from "../../constants";

export { creditTransactionTypes };

export const creditTransaction = pgTable("credit_transaction", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text("type").notNull(),
  amount: numeric("amount").notNull(),
  balance: numeric("balance").notNull(),
  orderId: text("order_id"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CreditTransaction = InferSelectModel<typeof creditTransaction>;
export type NewCreditTransaction = InferInsertModel<typeof creditTransaction>;
