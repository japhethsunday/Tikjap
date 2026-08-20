import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-semibold text-fg">Settings</h1>
        <SettingsNav />
        <div className="py-6">{children}</div>
      </div>
    </div>
  );
}