import { db } from "./src/db";
import { products } from "./src/db/schema";
import { eq, ilike } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function run() {
  const prods = await db.select().from(products).where(ilike(products.sku, "%3307%"));
  console.log("Found:", prods);
  process.exit(0);
}
run();
