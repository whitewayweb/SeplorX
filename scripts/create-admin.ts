import * as dotenv from "dotenv";
import path from "path";

// Load environment variables BEFORE any other imports
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  // Use dynamic imports to ensure env vars are loaded first
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const bcrypt = await import("bcryptjs");
  const readline = await import("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve));

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
  const hashedPassword = await bcrypt.default.hash(password, 10);

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
    console.error("\n❌ Failed to create admin:");
    console.error(error);
  }

  rl.close();
}

main().catch(console.error);
