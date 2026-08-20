"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { Button, Card, Input, Field } from "@/components/ui";
import { validateForgotPassword } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ email?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string>();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateForgotPassword({ email });
    if (validation.email) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await api.auth.forgotPassword(email.trim());
      if (result.demoResetToken) setResetToken(result.demoResetToken);
      setSent(true);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-semibold text-fg">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          If an account exists for <span className="font-medium text-fg">{email}</span>, a password reset link has been
          sent. It expires in 1 hour.
        </p>
        {resetToken ? (
          <div className="mt-5 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-4 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">Demo mode</p>
            <p className="mt-1.5 text-sm text-fg">Use this one-time reset token:</p>
            <code className="mt-1 block break-all rounded bg-surface px-2 py-1.5 font-mono text-xs text-fg">
              {resetToken}
            </code>
            <Link
              href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Continue to reset →
            </Link>
          </div>
        ) : null}
        <Link href="/login" className="mt-6 inline-block text-sm text-muted hover:text-fg">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-fg">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">We&apos;ll email you a secure reset link.</p>
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
        {errors.form ? <p className="text-sm text-danger">{errors.form}</p> : null}
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Send reset link
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}