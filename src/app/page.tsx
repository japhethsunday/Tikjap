"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, FileText, Zap, MessageSquare, ShieldCheck, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { PublicInfo } from "@/lib/types";
import { Button } from "@/components/ui";
import { LogoMark } from "@/components/logo";

const FEATURES = [
  {
    icon: <MessageSquare className="h-5 w-5" aria-hidden />,
    title: "Conversational chat",
    description: "Streaming, context-aware answers with edit-and-resend and regenerations.",
  },
  {
    icon: <Zap className="h-5 w-5" aria-hidden />,
    title: "Multiple models",
    description: "Pick the model that fits the task — from quick mini responses to deep reasoning.",
  },
  {
    icon: <FileText className="h-5 w-5" aria-hidden />,
    title: "File attachments",
    description: "Attach images and documents for richer, grounded answers.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" aria-hidden />,
    title: "Private by design",
    description: "Server-side auth, hashed sessions, and scoped API access. Your data stays yours.",
  },
];

export default function LandingPage() {
  const [info, setInfo] = useState<PublicInfo | null>(null);

  useEffect(() => {
    api.public.info().then(({ info }) => setInfo(info)).catch(() => undefined);
  }, []);

  const name = info?.appName ?? "Tikjap AI";
  const plans = info?.plans?.length
    ? info.plans
    : [
        { name: "Free", price: 0, features: ["100 messages / day", "All models", "Community support"] },
        { name: "Pro", price: 20, features: ["Unlimited messages", "Priority streaming", "File attachments", "Email support"] },
        { name: "Team", price: 49, features: ["Everything in Pro", "Shared workspaces", "Admin dashboard", "Usage analytics"] },
      ];

  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-fg">
          <LogoMark size={30} />
          <span className="font-semibold">{name}</span>
        </div>
        <nav className="flex items-center gap-2" aria-label="Primary">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-fg">
            Sign in
          </Link>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          Streaming AI assistant — {info?.mode === "demo" ? "live demo backend" : "production ready"}
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          Answers that arrive as you think them.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          {name} is a fast, private AI assistant. Stream responses, attach files, switch models, and pick up where you left off — all from one clean workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup">
            <Button size="lg">
              Start chatting
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-label="Features">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-line bg-surface/50 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {feature.icon}
              </div>
              <h3 className="mt-4 font-semibold text-fg">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {info?.billingEnabled !== false ? (
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-label="Pricing">
          <h2 className="text-center text-2xl font-bold text-fg">Simple pricing</h2>
          <p className="mt-2 text-center text-muted">Start free, upgrade when you&apos;re ready.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className="flex flex-col rounded-2xl border border-line bg-surface/50 p-6">
                <h3 className="font-semibold text-fg">{plan.name}</h3>
                <p className="mt-2 text-3xl font-bold text-fg">
                  ${plan.price}
                  <span className="text-sm font-normal text-muted">/mo</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="mt-6">
                  <Button className="w-full" variant={plan.price === 20 ? undefined : "outline"}>
                    Choose {plan.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Built for speed and privacy.
          </span>
        </div>
      </footer>
    </main>
  );
}