import { getUserChannels } from "@/lib/channels/queries";
import { AppSidebarClient } from "./app-sidebar-client";
import { getAuthenticatedSession } from "@/lib/auth";

export async function AppSidebar() {
  const sessionData = await getAuthenticatedSession();

  const userId = Number(sessionData.user.id);

  // Database logic is abstracted into the Data Access Layer
  const userChannels = await getUserChannels(userId);

  return <AppSidebarClient userChannels={userChannels} />;
}
