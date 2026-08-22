import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Pricing · Tikjap AI",
  description: "Simple plans for Tikjap AI.",
};

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    features: [
      "100 messages / day",
      "All base models",
      "3 projects · 20 assistants",
      "50 MB file storage",
      "1,200 character reply cap",
    ],
    cta: "Start free",
    href: "/signup",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    cadence: "per month",
    features: [
      "1,000 messages / day",
      "Priority model access",
      "Unlimited projects & assistants",
      "2 GB file storage",
      "5,000 character reply cap",
      "Scheduled prompts",
    ],
    cta: "Upgrade to Pro",
    href: "/settings/usage",
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$29",
    cadence: "per user / month",
    features: [
      "5,000 messages / day",
      "Everything in Pro",
      "20 GB shared storage",
      "16,000 character reply cap",
      "Admin analytics & feedback review",
    ],
    cta: "Contact sales",
    href: "/settings/usage",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-14">
      <header className="mb-10 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <LogoMark size={26} />
          Tikjap<span className="font-normal text-muted"> AI</span>
        </span>
        <Link href="/chat" className="text-sm font-medium text-muted transition-colors hover:text-fg">
          Open app →
        </Link>
      </header>
      <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">Pick the plan that fits</h1>
      <p className="mt-2 max-w-xl text-muted">
        Every plan includes streaming chat, projects with knowledge sources, saved memories and assistants.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
          <section
            key={plan.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              plan.highlight ? "border-accent shadow-lg ring-1 ring-accent/30" : "border-line"
            }`}
            aria-label={`${plan.name} plan`}
          >
            {plan.highlight ? (
              <span className="mb-3 inline-flex w-fit rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent ring-1 ring-accent/30">
                Most popular
              </span>
            ) : null}
            <h2 className="text-lg font-semibold text-fg">{plan.name}</h2>
            <p className="mt-1">
              <span className="text-3xl font-bold text-fg">{plan.price}</span>{" "}
              <span className="text-sm text-muted">{plan.cadence}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className={`mt-6 block rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-opacity ${
                plan.highlight
                  ? "bg-primary text-primary-fg hover:opacity-90"
                  : "border border-line text-fg hover:bg-surface"
              }`}
            >
              {plan.cta}
            </Link>
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted">
        Billing runs through Stripe when enabled for this deployment; plan changes are applied instantly by admins otherwise.
      </p>
    </main>
  );
}
