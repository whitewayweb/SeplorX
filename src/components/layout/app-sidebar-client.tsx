"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/logout/actions";
import {
  LayoutDashboard,
  Building2,
  Package,
  FileText,
  Warehouse,
  Puzzle,
  Bot,
  Receipt,
  Store,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Companies", href: "/companies", icon: Building2 },
  { title: "Products", href: "/products", icon: Package },
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Purchase Bills", href: "/purchase/bills", icon: Receipt },
  { title: "Inventory", href: "/inventory", icon: Warehouse },
  { title: "Channels", href: "/channels", icon: Store },
  { title: "Apps", href: "/apps", icon: Puzzle },
];

const aiNavItems = [
  { title: "Agents", href: "/ai/agents", icon: Bot },
];

export function AppSidebarClient({
  userChannels = [],
}: {
  userChannels: { id: number; name: string }[];
}) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          SeplorX
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.title === "Products"
                        ? pathname.startsWith(item.href) && !pathname.includes("/products/channels")
                        : item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>

                  {item.title === "Products" && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/products"}
                        >
                          <Link href="/products">All Products</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {userChannels.map((channel) => (
                        <SidebarMenuSubItem key={channel.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === `/products/channels/${channel.id}`}
                          >
                            <Link href={`/products/channels/${channel.id}`}>
                              {channel.name}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>AI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {aiNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <form action={logoutAction}>
                  <SidebarMenuButton type="submit">
                    <LogOut />
                    <span>Log Out</span>
                  </SidebarMenuButton>
                </form>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
