"use client";

import { useTheme, ACCENT_OPTIONS, type Theme, type AccentId } from "@/components/providers/theme";
import { Card } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: "light", label: "Light", description: "Bright interface for daytime use." },
  { value: "dark", label: "Dark", description: "Reduced glare for low-light environments." },
  { value: "system", label: "System", description: "Follow your device's appearance." },
];

export default function AppearanceSettingsPage() {
  const { theme, setTheme, resolved, accent, setAccent } = useTheme();

  return (
    <div className="space-y-6">
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

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Accent color</h2>
        <p className="mt-1 text-sm text-muted">Highlights buttons, links and active states across the app.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Accent color">
          {ACCENT_OPTIONS.map((option) => (
            <AccentSwatch
              key={option.id}
              option={option}
              selected={accent === option.id}
              onSelect={() => setAccent(option.id as AccentId)}
            />
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Brand</h2>
        <p className="mt-1 text-sm text-muted">The Tikjap AI mark — a chat bubble with a spark for fast answers.</p>
        <div className="mt-4 flex items-center gap-6 rounded-xl border border-line p-5">
          <LogoMark size={48} />
          <div>
            <p className="text-lg font-semibold tracking-tight text-fg">
              Tikjap<span className="font-normal text-muted"> AI</span>
            </p>
            <p className="text-xs text-muted">Fast, private AI chat</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AccentSwatch({
  option,
  selected,
  onSelect,
}: {
  option: (typeof ACCENT_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        selected ? "border-accent bg-accent/5" : "border-line hover:bg-surface"
      )}
    >
      <span
        aria-hidden
        className="h-7 w-7 shrink-0 rounded-full ring-2 ring-white/20 dark:ring-black/20"
        style={{ background: `linear-gradient(135deg, ${option.swatch}, ${option.swatchDark})` }}
      />
      <span>
        <span className="block text-sm font-medium text-fg">{option.label}</span>
        {selected ? <span className="block text-[11px] text-accent">Active</span> : null}
      </span>
    </button>
  );
}
