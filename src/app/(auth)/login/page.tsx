"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { LogoMark } from "@/components/logo";
import { Button, Card, Input, Field, FormError } from "@/components/ui";
import { validateLogin } from "@/lib/validation";
import { errorMessage } from "@/lib/api";
import { api } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="p-8">
          <div className="flex h-64 items-center justify-center text-sm text-muted">Loading…</div>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateLogin({ email, password });
    if (validation.email || validation.password) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login({ email, password });
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/home");
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 w-fit">
          <LogoMark size={44} />
        </div>
        <h1 className="text-xl font-semibold text-fg">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue to Tikjap AI</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        <FormError message={errors.form} />
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Sign in
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
        <Link href="/forgot-password" className="text-muted hover:text-fg">
          Forgot password?
        </Link>
      </div>

      <DemoAccounts onFill={(account) => {
        setEmail(account.email);
        setPassword(account.password);
        setErrors({});
      }} />
    </Card>
  );
}

function DemoAccounts({ onFill }: { onFill: (account: { email: string; password: string }) => void }) {
  const [accounts, setAccounts] = useState<{ email: string; password: string; role: string }[]>([]);

  useEffect(() => {
    api.public
      .info()
      .then(({ info }) => setAccounts(info.seedAccounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  if (!accounts.length) return null;
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Demo accounts</p>
      <ul className="mt-2 space-y-1.5">
        {accounts.map((account) => (
          <li key={account.email} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-fg">
              {account.email} <span className="text-muted">({account.role})</span>
            </span>
            <button
              type="button"
              onClick={() => onFill(account)}
              className="shrink-0 font-medium text-accent hover:underline"
            >
              Fill
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}