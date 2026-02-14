import { db } from "../src/db";
import { users } from "../src/db/schema";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import readline from "readline";

// Load environment variables for the database connection
dotenv.config({ path: ".env.local" });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("\n--- Create Admin User ---");
  
  const name = await question("Admin Name: ");
  const email = await question("Admin Email: ");
  const password = await question("Admin Password: ");

  if (!name || !email || !password) {
    console.error("❌ Error: All fields are required.");
    rl.close();
    process.exit(1);
  }

  // Hash the password for security
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.insert(users).values({
      name,
      email,
      password: hashedPassword,
      role: "admin",
    });
    console.log("\n✅ Admin user created successfully!");
    console.log(`Email: ${email}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Database error";
    console.error("\n❌ Failed to create admin:", errorMessage);
  }

  rl.close();
}

main();
