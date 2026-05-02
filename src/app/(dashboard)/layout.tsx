import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/organisms/layout/app-sidebar";
import { getAuthenticatedUserId } from "@/lib/auth";
import { triggerOnDemandSync } from "@/lib/agents/on-demand-sync";
import { logger } from "@/lib/logger";
import { durationMs, startTimer } from "@/lib/debug-timing";

export default async function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const startedAt = startTimer();
    const userId = await getAuthenticatedUserId();
    logger.info("[dashboard-layout] auth complete", {
        durationMs: durationMs(startedAt),
    });
    
    // Trigger "Always Active" autonomous sync if data is stale (>15 mins)
    // Runs in background via fire-and-forget fetch in the utility
    const syncStartedAt = startTimer();
    await triggerOnDemandSync(userId);
    logger.info("[dashboard-layout] on-demand sync check complete", {
        durationMs: durationMs(syncStartedAt),
        totalDurationMs: durationMs(startedAt),
    });

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
                <main className="flex-1 relative min-w-0 overflow-hidden">
                    <div className="absolute top-6 left-6 z-50 md:top-[28px] md:left-[24px]">
                        <SidebarTrigger className="-ml-1 bg-background/50 backdrop-blur-sm" />
                    </div>
                    {/* We use a CSS :has() selector to push the page headers specifically to the right to make room for the floating trigger, avoiding wasted vertical space. */}
                    <div className="[&_div:has(>h1.text-3xl)]:ml-12">
                        {children}
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
