import { CommerceDashboard } from "@/components/organisms/dashboard/commerce-dashboard";
import { getCommerceDashboardData } from "@/data/dashboard";
import { getAuthenticatedUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getAuthenticatedUserId();
  const dashboard = await getCommerceDashboardData(userId);

  return <CommerceDashboard dashboard={dashboard} />;
}
