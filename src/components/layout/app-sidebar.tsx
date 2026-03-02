import { getUserChannels } from "@/lib/channels/queries";
import { AppSidebarClient } from "./app-sidebar-client";

const CURRENT_USER_ID = 1;

export async function AppSidebar() {
  // Database logic is abstracted into the Data Access Layer
  const userChannels = await getUserChannels(CURRENT_USER_ID);

  return <AppSidebarClient userChannels={userChannels} />;
}
