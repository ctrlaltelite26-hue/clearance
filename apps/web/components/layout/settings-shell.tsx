"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsNavItems } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";

type SettingsShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
};

export function SettingsShell({
  title,
  description,
  children,
  action,
}: SettingsShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-end justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <nav className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Settings</span>
            <span>/</span>
            <span className="text-primary">{title}</span>
          </nav>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="mt-3 flex gap-4 border-b border-transparent">
            {settingsNavItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "border-b-2 pb-2 text-sm transition-colors",
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        {action}
      </header>
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}
