import { pgTable, serial, varchar, timestamp, pgEnum, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "customer"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }),
  role: roleEnum("role").default("customer").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appStatusEnum = pgEnum("app_status", ["installed", "configured"]);

export const appInstallations = pgTable("app_installations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 100 }).notNull(),
  status: appStatusEnum("status").default("installed").notNull(),
  config: jsonb("config").$type<Record<string, string>>().default({}).notNull(),
  installedAt: timestamp("installed_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("app_installations_user_app_idx").on(table.userId, table.appId),
]);
