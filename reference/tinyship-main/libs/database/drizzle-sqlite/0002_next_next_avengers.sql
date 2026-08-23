CREATE TABLE `commission` (
	`id` text PRIMARY KEY NOT NULL,
	`referrer_id` text NOT NULL,
	`order_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`order_amount` text NOT NULL,
	`currency` text NOT NULL,
	`commission_rate` text NOT NULL,
	`commission_amount` text NOT NULL,
	`status` text DEFAULT 'credited' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`referrer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_order_id_unique` ON `commission` (`order_id`);--> statement-breakpoint
CREATE TABLE `withdrawal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`payment_method` text NOT NULL,
	`payment_account` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`processed_at` integer,
	`processed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `referral_code` text;--> statement-breakpoint
ALTER TABLE `user` ADD `referred_by_code` text;--> statement-breakpoint
ALTER TABLE `user` ADD `commission_balance` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `kyc_verified` integer DEFAULT true;--> statement-breakpoint
CREATE UNIQUE INDEX `user_referral_code_unique` ON `user` (`referral_code`);