import { CommerceDashboard } from "@/components/organisms/dashboard/commerce-dashboard";
import { getCommerceDashboardData, parseDashboardRange } from "@/data/dashboard";
import { getAuthenticatedUserId } from "@/lib/auth";
import { triggerOnDemandSync } from "@/lib/agents/on-demand-sync";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{
    range?: string | string[];
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const userId = await getAuthenticatedUserId();
  await triggerOnDemandSync(userId);

  const params = await searchParams;
  const dashboard = await getCommerceDashboardData(userId, {
    rangeDays: parseDashboardRange(params.range),
  });

  return <CommerceDashboard dashboard={dashboard} />;
}
