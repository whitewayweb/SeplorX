import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/organisms/layout/app-sidebar";

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <main className="flex-1 relative">
                    <div className="absolute top-6 left-6 z-50 md:top-[28px] md:left-[24px]">
                        <SidebarTrigger className="-ml-1 bg-background/50 backdrop-blur-sm" />
                    </div>
                    {/* We use a CSS selector to push the page headers specifically to the right to make room for the floating trigger, avoiding wasted vertical space. */}
                    <div className="[&>div>div.flex.items-center.justify-between>div:first-child]:ml-10 [&>div>h1.text-3xl]:ml-10 [&>div>p.text-muted-foreground]:ml-10">
                        {children}
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
