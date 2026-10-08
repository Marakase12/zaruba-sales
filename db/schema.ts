import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const payments = sqliteTable("payments", {
  slot: integer("slot").primaryKey(), managerKey: text("manager_key").notNull(),
  firstName: text("first_name").notNull(), lastName: text("last_name").notNull(),
  amountKopecks: integer("amount_kopecks").notNull(), photoKey: text("photo_key").notNull(),
  version: integer("version").notNull().default(1), updatedAt: text("updated_at").notNull(),
});
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(), attempts: integer("attempts").notNull(), resetAt: integer("reset_at").notNull(),
});
