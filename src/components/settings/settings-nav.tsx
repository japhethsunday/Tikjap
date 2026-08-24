"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Palette, Sparkles, BarChart3, ShieldCheck, BrainCircuit, Database } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings/account", label: "Account", icon: <User className="h-4 w-4" aria-hidden /> },
  { href: "/settings/appearance", label: "Appearance", icon: <Palette className="h-4 w-4" aria-hidden /> },
  { href: "/settings/ai-preferences", label: "AI preferences", icon: <Sparkles className="h-4 w-4" aria-hidden /> },
  { href: "/settings/intelligence", label: "Intelligence", icon: <BrainCircuit className="h-4 w-4" aria-hidden /> },
  { href: "/settings/data", label: "Data", icon: <Database className="h-4 w-4" aria-hidden /> },
  { href: "/settings/usage", label: "Usage", icon: <BarChart3 className="h-4 w-4" aria-hidden /> },
  { href: "/settings/security", label: "Security", icon: <ShieldCheck className="h-4 w-4" aria-hidden /> },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings"
      className="tk-scroll-x -mx-1 flex gap-1 border-b border-line px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0 lg:[mask-image:none]"
    >
      {SECTIONS.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:w-full",
              active
                ? "bg-surface text-fg ring-1 ring-line lg:ring-0"
                : "text-muted hover:bg-surface/60 hover:text-fg"
            )}
          >
            <span className={cn("shrink-0", active ? "text-accent" : "text-muted")}>{section.icon}</span>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}