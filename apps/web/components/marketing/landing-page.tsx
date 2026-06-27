import {
  Mail,
  Brain,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const features = [
  {
    icon: Mail,
    title: "Real inboxes",
    description:
      "Create dedicated support addresses on AgentMail. Your team gets a real inbox, not a demo sandbox.",
  },
  {
    icon: Brain,
    title: "Smart triage",
    description:
      "Qwen classifies intent, urgency, and confidence on every thread — then builds an action plan.",
  },
  {
    icon: ShieldCheck,
    title: "Human when it counts",
    description:
      "Risky actions hit your approvals queue. Drafts are reviewed before anything is sent.",
  },
];

const steps = [
  {
    n: "01",
    title: "Connect your inbox",
    description:
      "Create a real @agentmail.to address during onboarding — custom domains when you're ready.",
  },
  {
    n: "02",
    title: "Train on your knowledge",
    description:
      "Upload FAQs and docs so drafts cite real company context, not generic AI filler.",
  },
  {
    n: "03",
    title: "Autopilot drafts & labels",
    description:
      "Clearance analyzes inbound mail, runs tools, and prepares replies in the background.",
  },
  {
    n: "04",
    title: "Review & send",
    description:
      "Your team approves risky actions and confirms outbound drafts before they go live.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />

      <main className="pt-14">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge
              variant="secondary"
              className="gap-1.5 border border-border bg-card px-3 py-1"
            >
              <Sparkles className="size-3 text-primary" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-primary">
                Autopilot for real email
              </span>
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your inbox,{" "}
              <span className="text-primary">on autopilot.</span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Clearance connects to your real support inbox to analyze intent,
              draft responses, and escalate to humans only when it matters.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton size="lg" href="/sign-up">
                Start free
                <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton variant="outline" size="lg" href="#how-it-works">
                See how it works
              </LinkButton>
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Built on AgentMail · Powered by Qwen Cloud
            </p>
          </div>

          <Card className="border-border bg-card shadow-none">
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  <span className="size-2 rounded-full bg-brand-warning" />
                  <span className="size-2 rounded-full bg-primary" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  thread_processor
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 font-mono text-sm">
              <p className="text-primary">
                &gt; Analyzing: &quot;I can&apos;t access my billing
                portal…&quot;
              </p>
              <p className="text-muted-foreground">[INTENT] Billing access</p>
              <p className="text-muted-foreground">[URGENCY] High</p>
              <p className="text-muted-foreground">
                &gt; Drafting with knowledge.search…
              </p>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                Ready for human review
              </Badge>
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section
          id="features"
          className="border-y border-border bg-card/50 py-20"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Designed for high-velocity support teams
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Focus on strategic problem-solving while Clearance handles
                triage and drafting at scale.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {features.map((f) => (
                <Card
                  key={f.title}
                  className="border-border bg-card shadow-none transition-colors hover:border-primary/50"
                >
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-md border border-border bg-background">
                      <f.icon className="size-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    <CardDescription>{f.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.n} className="space-y-3">
                <div className="flex size-10 items-center justify-center rounded-full border border-primary font-mono text-sm text-primary">
                  {step.n}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <Card className="mt-16 border-border border-l-4 border-l-brand-warning bg-card shadow-none">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-brand-warning">
                  Status: Pending approval
                </p>
                <CardTitle className="mt-1 text-base">
                  Draft reply for #4421 — Password reset
                </CardTitle>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button size="sm">Approve & send</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                Hi Alex, I&apos;ve checked your account and initiated a secure
                reset link. You should receive it within a few minutes…
              </p>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-8 py-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Take the friction out of your support desk
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Real inboxes, grounded AI drafts, and human approval when it
              matters.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton size="lg" href="/sign-up">
                Start your free trial
              </LinkButton>
              <LinkButton variant="outline" size="lg" href="/sign-in">
                Sign in
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} Clearance</p>
          <p className="font-mono text-xs">Track 4 · Qwen Cloud Hackathon</p>
        </div>
      </footer>
    </div>
  );
}
