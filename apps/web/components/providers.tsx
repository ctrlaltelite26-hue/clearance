"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <TooltipProvider delay={200}>
        {children}
        <Toaster richColors theme="dark" position="bottom-right" />
      </TooltipProvider>
    </ClerkProvider>
  );
}
