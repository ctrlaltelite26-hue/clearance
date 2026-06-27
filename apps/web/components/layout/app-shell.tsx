"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  FileText,
  HelpCircle,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { isNavActive, mainNavItems } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";

function workspaceInitials(email: string | null | undefined) {
  if (!email) return "CL";
  const part = email.split("@")[0]?.slice(0, 2) ?? "CL";
  return part.toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const api = useApi();
  const [pendingCount, setPendingCount] = useState(0);
  const [inboxEmail, setInboxEmail] = useState<string | null>(null);
  const [inboxName, setInboxName] = useState<string | null>(null);

  useEffect(() => {
    if (!api.isAuthReady) return;

    let cancelled = false;
    async function load() {
      try {
        const [approvals, inboxes] = await Promise.all([
          api.listApprovals(),
          api.listInboxes(),
        ]);
        if (!cancelled) {
          setPendingCount(approvals.length);
          setInboxEmail(inboxes[0]?.emailAddress ?? null);
          setInboxName(inboxes[0]?.displayName ?? null);
        }
      } catch {
        /* sidebar badges are best-effort */
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, api.isAuthReady]);

  const workspaceLabel = inboxName ?? "Workspace";

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="w-60 border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
          <Link href="/" className="mb-3 flex px-1">
            <span className="text-sm font-bold tracking-tight text-primary">
              Clearance AI
            </span>
          </Link>

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-brand-elevated px-3 py-2 text-left text-sm transition-colors hover:bg-muted group-data-[collapsible=icon]:hidden"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-brand-warning/30 text-[10px] font-bold">
                {workspaceInitials(inboxEmail)}
              </div>
              <div className="min-w-0 truncate">
                <p className="truncate font-medium">{workspaceLabel}</p>
                {inboxEmail && (
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {inboxEmail}
                  </p>
                )}
              </div>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        className={cn(
                          active &&
                            "border-l-2 border-primary bg-sidebar-accent font-medium text-primary",
                        )}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                        {item.badge && pendingCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-auto bg-primary/15 text-primary"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <LinkButton
            href="/automations"
            className="mb-3 w-full group-data-[collapsible=icon]:hidden"
            size="sm"
          >
            Manage Automation
          </LinkButton>

          <div className="mb-3 space-y-1 group-data-[collapsible=icon]:hidden">
            <div className="flex h-8 w-full items-center gap-2 px-2 text-xs text-muted-foreground">
              <HelpCircle className="size-4" />
              Help Center
            </div>
            <div className="flex h-8 w-full items-center gap-2 px-2 text-xs text-muted-foreground">
              <FileText className="size-4" />
              Documentation
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <UserButton />
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium">
                {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Agent active
              </p>
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh bg-background">{children}</SidebarInset>
    </SidebarProvider>
  );
}
