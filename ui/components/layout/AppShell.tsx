"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavUser } from "./NavUser";
import { ProfileBadge } from "../profile/ProfileBadge";
import { ThreadList } from "../assistant-ui/thread-list";
import { MessageSquare, FileText, User, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/profile", icon: User, label: "Profile" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b p-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">Medical AI</h1>
              <ProfileBadge />
            </div>
          </SidebarHeader>
          <SidebarContent className="min-w-0">
            <div className="flex flex-col h-full w-full min-w-0">
              {/* Main Navigation */}
              <nav className="flex flex-col gap-1 p-2 border-b w-full min-w-0">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Thread List - Only show on chat pages */}
              {(pathname === "/chat" || pathname.startsWith("/chat/")) && (
                <div className="flex-1 overflow-hidden min-w-0 border-t">
                  <ThreadList />
                </div>
              )}
            </div>
          </SidebarContent>
          <SidebarFooter className="border-t p-4">
            <NavUser />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <main className="flex-1 overflow-auto">
          <div className="flex h-14 items-center border-b px-4 lg:hidden">
            <SidebarTrigger />
          </div>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
