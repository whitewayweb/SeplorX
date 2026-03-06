import { getUserChannels } from "@/lib/channels/queries";
import { AppSidebarClient } from "./app-sidebar-client";
import { getSession } from "@/lib/auth/session";

export async function AppSidebar() {
  const session = await getSession();
  const userId = session?.userId || 1;

  // Database logic is abstracted into the Data Access Layer
  const userChannels = await getUserChannels(userId);

  return <AppSidebarClient userChannels={userChannels} />;
}
