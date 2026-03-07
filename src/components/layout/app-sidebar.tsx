import { getUserChannels } from "@/lib/channels/queries";
import { AppSidebarClient } from "./app-sidebar-client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function AppSidebar() {
  const sessionData = await auth.api.getSession({
    headers: await headers()
  });
  const userId = Number(sessionData?.user?.id) || 1;

  // Database logic is abstracted into the Data Access Layer
  const userChannels = await getUserChannels(userId);

  return <AppSidebarClient userChannels={userChannels} />;
}
