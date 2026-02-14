import { db } from "@/db";
import { users } from "@/db/schema";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function GET() {
  const hashedPassword = await bcrypt.hash("admin123", 10);
  
  try {
    await db.insert(users).values({
      name: "Admin User",
      email: "admin@seplorx.com",
      password: hashedPassword,
      role: "admin",
    });
    
    return NextResponse.json({ message: "Admin user created successfully" });
  } catch {
    return NextResponse.json({ error: "User might already exist" }, { status: 400 });
  }
}
