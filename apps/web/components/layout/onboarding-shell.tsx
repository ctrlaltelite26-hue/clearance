"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const steps = [
  { href: "/onboarding/inbox", label: "Inbox setup", step: 2 },
  { href: "/onboarding/knowledge", label: "Knowledge base", step: 3 },
  { href: "/onboarding/complete", label: "Go live", step: 4 },
];

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStep =
    steps.find((s) => pathname.startsWith(s.href))?.step ?? 2;
  const isKnowledge = pathname.startsWith("/onboarding/knowledge");
  const progress = ((currentStep - 1) / 3) * 100;

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-6 lg:block">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </div>
          <span className="font-semibold">Clearance</span>
        </Link>

        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Onboarding
        </p>
        <ol className="space-y-1">
          <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
            <Check className="size-4 text-primary" />
            Account
          </li>
          {steps.map((step) => {
            const done = currentStep > step.step;
            const active = pathname.startsWith(step.href);
            return (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active &&
                      "border-l-2 border-primary bg-muted font-medium text-foreground",
                    done && !active && "text-muted-foreground",
                    !done && !active && "text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-4 text-primary" />
                  ) : (
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full border text-[10px]",
                        active && "border-primary text-primary",
                      )}
                    >
                      {step.step}
                    </span>
                  )}
                  {step.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="border-b border-border px-6 py-4 lg:px-10">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Step {currentStep} of 4
            </p>
            <div className="flex flex-1 max-w-xs items-center gap-3">
              <Progress value={progress} className="h-1.5" />
            </div>
          </div>
        </header>
        <div className="flex flex-1 items-start justify-center p-6 lg:p-10">
          <div
            className={cn(
              "w-full",
              isKnowledge ? "max-w-3xl" : "max-w-2xl",
            )}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
