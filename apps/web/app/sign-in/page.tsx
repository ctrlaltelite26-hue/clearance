import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute -left-48 -top-48 size-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(45, 212, 191, 0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-48 size-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(45, 212, 191, 0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        <SignInForm />
        <div className="mt-6 flex items-center justify-center gap-2 opacity-50">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">
            All systems operational
          </span>
        </div>
      </div>
    </div>
  );
}
