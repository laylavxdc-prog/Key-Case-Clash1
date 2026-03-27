import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  keys: integer("keys").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  itemName: text("item_name").notNull(),
  rarity: text("rarity").notNull(),
  obtainedAt: timestamp("obtained_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, keys: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type InventoryItem = typeof inventoryTable.$inferSelect;
