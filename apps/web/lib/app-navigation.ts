import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Inbox,
  Settings,
  ShieldCheck,
  Zap,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
};

/** Canonical sidebar nav — matches stitch inbox / settings screens */
export const mainNavItems: AppNavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: true },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/inboxes", label: "Settings", icon: Settings },
];

export const settingsNavItems = [
  { href: "/settings/inboxes", label: "Inboxes" },
  { href: "/settings/knowledge", label: "Knowledge" },
  { href: "/settings/policies", label: "Policies" },
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/settings/inboxes") {
    return pathname.startsWith("/settings");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
