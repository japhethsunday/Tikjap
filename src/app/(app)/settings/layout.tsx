import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-6 lg:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your account, preferences and usage across Tikjap.
          </p>
        </header>

        {/*
          Two columns on desktop so the section list stays visible while you
          work, and the content column keeps a comfortable reading measure.
          Below `lg` the nav collapses to the scrolling pill row it was.
        */}
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <SettingsNav />
          <div className="min-w-0 pt-6 lg:pt-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
