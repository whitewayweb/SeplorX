"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/client";
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
  User,
  ShoppingCart,
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
import { PORTAL_NAME } from "@/utils/constants";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Companies", href: "/companies", icon: Building2 },
  { title: "Products", href: "/products", icon: Package },
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Purchase Bills", href: "/purchase/bills", icon: Receipt },
  { title: "Inventory", href: "/inventory", icon: Warehouse },
  { title: "Orders", href: "/orders", icon: ShoppingCart },
  { title: "Channels", href: "/channels", icon: Store },
  { title: "Apps", href: "/apps", icon: Puzzle },
];

const aiNavItems = [
  { title: "Agents", href: "/ai/agents", icon: Bot },
];

const SidebarLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof Link>
>(function SidebarLink({ prefetch = false, ...props }, ref) {
  return <Link ref={ref} prefetch={prefetch} {...props} />;
});

export function AppSidebarClient({
  userChannels = [],
}: {
  userChannels: { id: number; name: string }[];
}) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <SidebarLink href="/" className="text-lg font-bold tracking-tight">
          SeplorX
        </SidebarLink>
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
                      item.title === "Products" || item.title === "Orders"
                        ? pathname.startsWith(item.href) && !pathname.includes(`${item.href}/channels`)
                        : item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href)
                    }
                  >
                    <SidebarLink href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarLink>
                  </SidebarMenuButton>

                  {item.title === "Products" && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/products"}
                        >
                          <SidebarLink href="/products">{PORTAL_NAME} Products</SidebarLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/products/fitment"}
                        >
                          <SidebarLink href="/products/fitment">Fitment Registry</SidebarLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {userChannels.map((channel) => (
                        <SidebarMenuSubItem key={channel.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === `/products/channels/${channel.id}`}
                          >
                            <SidebarLink href={`/products/channels/${channel.id}`}>
                              {channel.name}
                            </SidebarLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}

                  {item.title === "Orders" && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/orders"}
                        >
                          <SidebarLink href="/orders">All Orders</SidebarLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {userChannels.map((channel) => (
                        <SidebarMenuSubItem key={channel.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === `/orders/channels/${channel.id}`}
                          >
                            <SidebarLink href={`/orders/channels/${channel.id}`}>
                              {channel.name}
                            </SidebarLink>
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
                    <SidebarLink href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarLink>
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
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/profile"}
                >
                  <SidebarLink href="/profile">
                    <User />
                    <span>Profile</span>
                  </SidebarLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={async () => {
                  await signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login'; } } })
                }}>
                  <LogOut />
                  <span>Log Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
