"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useSignUp } from "@clerk/nextjs/legacy";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { BrandHeader } from "@/components/auth/brand-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function SignUpForm() {
  const router = useRouter();
  const { setActive } = useClerk();
  const { isLoaded, signUp } = useSignUp();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    if (!terms) {
      toast.error("Please accept the Terms of Service and Privacy Policy");
      return;
    }

    setLoading(true);
    try {
      await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: { companyName: company },
      });

      if (signUp.status === "complete") {
        await setActive({ session: signUp.createdSessionId });
        router.push("/onboarding/inbox");
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      toast.success("Check your email for a verification code");
    } catch (err) {
      const message = isClerkAPIResponseError(err)
        ? err.errors[0]?.longMessage ?? err.errors[0]?.message
        : "Could not create account";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/onboarding/inbox");
      }
    } catch (err) {
      const message = isClerkAPIResponseError(err)
        ? err.errors[0]?.longMessage ?? err.errors[0]?.message
        : "Invalid verification code";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-2xl">
        <BrandHeader
          title="Verify your email"
          subtitle={`We sent a code to ${email}`}
        />
        <form onSubmit={handleVerify} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="bg-background"
              required
            />
          </div>
          <Button type="submit" className="w-full uppercase tracking-widest" disabled={loading}>
            {loading ? "Verifying…" : "Verify & continue"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-2xl">
      <BrandHeader
        title="Create your account"
        subtitle="Start your 14-day free trial"
      />

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company">Company name</Label>
          <Input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="bg-background"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="bg-background"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-background pr-10"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="terms"
            checked={terms}
            onCheckedChange={(v) => setTerms(v === true)}
          />
          <Label
            htmlFor="terms"
            className="text-sm leading-snug text-muted-foreground"
          >
            I agree to the{" "}
            <span className="text-primary hover:underline">Terms of Service</span>{" "}
            and{" "}
            <span className="text-primary hover:underline">Privacy Policy</span>.
          </Label>
        </div>

        <Button
          type="submit"
          className="mt-2 w-full uppercase tracking-widest"
          disabled={loading}
        >
          {loading ? "Creating…" : "Create account"}
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
