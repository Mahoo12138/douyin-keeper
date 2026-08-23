import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { userRoles } from "../../constants";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text("image"),
  role: text("role").default(userRoles.USER).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  phoneNumber: text("phone_number"),
  phoneNumberVerified: integer("phone_number_verified", { mode: 'boolean' }).default(false),
  stripeCustomerId: text("stripe_customer_id"),
  creemCustomerId: text("creem_customer_id"),
  dodoCustomerId: text("dodo_customer_id"),
  creditBalance: text("credit_balance").default("0").notNull(),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: text('ban_expires'),
  // Affiliate/Referral system
  referralCode: text("referral_code").unique(),
  referredByCode: text("referred_by_code"),
  commissionBalance: text("commission_balance").default("0").notNull(),
  kycVerified: integer("kyc_verified", { mode: 'boolean' }).default(true),
});

export type User = InferSelectModel<typeof user>;
export type NewUser = InferInsertModel<typeof user>;
