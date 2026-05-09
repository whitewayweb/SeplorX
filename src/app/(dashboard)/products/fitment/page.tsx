import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { FitmentList } from "@/components/organisms/products/fitment-list";
import { FitmentDialog } from "@/components/organisms/products/fitment-dialog";
import { getFitmentRegistry } from "@/data/fitment";

export const dynamic = "force-dynamic";

export default async function FitmentRegistryPage() {
  await getAuthenticatedUserId();

  const rules = await getFitmentRegistry();
  const makes = Array.from(new Set(rules.map(r => r.make))).sort();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fitment Registry"
        description="Manage car-to-product mappings for intelligent channel synchronization."
      >
        <div className="flex items-center gap-2">
           <FitmentDialog makes={makes} rules={rules} />
        </div>
      </PageHeader>

      <FitmentList rules={rules} />
    </div>
  );
}
