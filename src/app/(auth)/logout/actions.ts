"use server";

import { deleteSession } from "@/lib/auth/session";

export async function logoutAction() {
    await deleteSession();
}
