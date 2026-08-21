"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { Button, Card, Input, Field, FormError } from "@/components/ui";
import { validateResetPassword, passwordStrength } from "@/lib/validation";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card className="p-8">
          <div className="flex h-64 items-center justify-center text-sm text-muted">Loading…</div>
        </Card>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const strength = passwordStrength(password);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code) {
      setErrors({ form: "Missing reset link. Use the link from your email." });
      return;
    }
    const validation = validateResetPassword({ password, confirmPassword });
    if (validation.password || validation.confirmPassword) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.auth.resetPassword(code, password);
      setDone(true);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-semibold text-fg">Password updated</h1>
        <p className="mt-2 text-sm text-muted">Your password has been reset. All other sessions were signed out.</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
          Sign in →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-fg">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">Pick something secure — at least 8 characters.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
          />
          {password ? (
            <p className="mt-1 text-xs text-muted">
              Strength: <span className="font-medium text-fg">{strength.label}</span>
            </p>
          ) : null}
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(errors.confirmPassword)}
          />
        </Field>
        <FormError message={errors.form} />
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Reset password
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}