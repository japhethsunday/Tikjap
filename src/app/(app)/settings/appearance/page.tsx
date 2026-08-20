"use client";

import { Card } from "@/components/ui";
import { useTheme, type Theme } from "@/components/providers/theme";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: "light", label: "Light", description: "Bright interface for daytime use." },
  { value: "dark", label: "Dark", description: "Reduced glare for low-light environments." },
  { value: "system", label: "System", description: "Follow your device's appearance." },
];

export default function AppearanceSettingsPage() {
  const { theme, setTheme, resolved } = useTheme();

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-fg">Theme</h2>
      <p className="mt-1 text-sm text-muted">
        Currently using <span className="font-medium text-fg">{resolved}</span> mode.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                selected ? "border-accent bg-accent/5" : "border-line hover:bg-surface"
              )}
            >
              <p className="text-sm font-medium text-fg">{option.label}</p>
              <p className="mt-1 text-xs text-muted">{option.description}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}