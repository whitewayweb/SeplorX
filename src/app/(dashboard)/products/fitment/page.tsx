import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { FitmentList } from "@/components/organisms/products/fitment-list";
import { FitmentDialog } from "@/components/organisms/products/fitment-dialog";
import { getFitmentRegistry } from "@/data/fitment";

import { ShieldCheck, Info } from "lucide-react";

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

      <FitmentList rules={rules}>
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">How it Works</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Automotive Matching logic</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The <span className="text-foreground font-medium">Auto-Mapping Agent</span> extracts Make, Model, and Position from Amazon/WooCommerce product titles.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                It performs a match against this registry to determine which <span className="text-foreground font-medium">Series</span> (Front/Rear) the listing corresponds to.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                 Mappings are proposed for <span className="text-foreground font-medium">Human Approval</span> in your dashboard before going live.
              </p>
            </div>
          </div>
          
          <div className="pt-2 border-t border-border/40">
             <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 leading-snug">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Year ranges are optional. Rules without years apply to all generations of that car model.</span>
             </div>
          </div>
        </div>
      </FitmentList>
    </div>
  );
}
