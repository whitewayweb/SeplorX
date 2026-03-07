import { getUserChannels } from "@/lib/channels/queries";
import { AppSidebarClient } from "./app-sidebar-client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function AppSidebar() {
  const sessionData = await auth.api.getSession({
    headers: await headers()
  });

  if (!sessionData) {
    redirect("/login");
  }

  const userId = Number(sessionData.user.id);

  // Database logic is abstracted into the Data Access Layer
  const userChannels = await getUserChannels(userId);

  return <AppSidebarClient userChannels={userChannels} />;
}
