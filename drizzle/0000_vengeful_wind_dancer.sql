CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`slot` integer PRIMARY KEY NOT NULL,
	`manager_key` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`amount_kopecks` integer NOT NULL,
	`photo_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
