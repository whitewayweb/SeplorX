import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "development") {
  console.warn("⚠️ DATABASE_URL is not defined. Database connection will likely fail.");
}

// Create the connection using the URL string directly
// Use a fallback to avoid crashing during build time if env is missing
const connection = mysql.createPool(process.env.DATABASE_URL || "mysql://localhost:3306/dummy");

export const db = drizzle(connection, { schema, mode: "default" });
