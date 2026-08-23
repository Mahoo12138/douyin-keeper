import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { creditTransactionTypes } from "../../constants";

export { creditTransactionTypes };

export const creditTransaction = sqliteTable("credit_transaction", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  balance: text("balance").notNull(),
  orderId: text("order_id"),
  description: text("description"),
  metadata: text("metadata", { mode: 'json' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type CreditTransaction = InferSelectModel<typeof creditTransaction>;
export type NewCreditTransaction = InferInsertModel<typeof creditTransaction>;
