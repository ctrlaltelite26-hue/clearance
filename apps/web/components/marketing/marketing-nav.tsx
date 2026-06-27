"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Zap } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
];

export function MarketingNav() {
  const { isSignedIn } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Clearance</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <>
              <LinkButton variant="ghost" size="sm" href="/inbox">
                Open inbox
              </LinkButton>
              <LinkButton size="sm" href="/onboarding/inbox">
                Setup
              </LinkButton>
            </>
          ) : (
            <>
              <LinkButton variant="ghost" size="sm" href="/sign-in">
                Sign in
              </LinkButton>
              <LinkButton size="sm" href="/sign-up">
                Get started
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
