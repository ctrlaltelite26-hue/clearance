import { AuthFooter } from "@/components/auth/auth-footer";
import { InboxPreview } from "@/components/auth/inbox-preview";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 pb-24">
      <main className="grid w-full max-w-5xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="flex justify-center lg:justify-end">
          <SignUpForm />
        </div>
        <InboxPreview />
      </main>
      <AuthFooter />
    </div>
  );
}
