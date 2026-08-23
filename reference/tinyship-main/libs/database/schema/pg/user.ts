import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { userRoles } from "../../constants";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: boolean('email_verified').notNull(),
  image: text("image"),
  role: text("role").default(userRoles.USER).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  phoneNumber: text("phone_number"),
  phoneNumberVerified: boolean("phone_number_verified").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  creemCustomerId: text("creem_customer_id"),
  dodoCustomerId: text("dodo_customer_id"),
  creditBalance: numeric("credit_balance").default("0").notNull(),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: numeric('ban_expires'),
  // Affiliate/Referral system
  referralCode: text("referral_code").unique(),
  referredByCode: text("referred_by_code"),
  commissionBalance: numeric("commission_balance").default("0").notNull(),
  kycVerified: boolean("kyc_verified").default(true),
});

export type User = InferSelectModel<typeof user>;
export type NewUser = InferInsertModel<typeof user>;
