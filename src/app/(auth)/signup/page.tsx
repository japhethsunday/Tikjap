"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { LogoMark } from "@/components/logo";
import { Button, Card, Input, Field, FormError } from "@/components/ui";
import { validateSignup } from "@/lib/validation";
import { errorMessage } from "@/lib/api";

export default function SignupPage() {
  const { user, signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateSignup({ name, email, password, confirmPassword });
    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await signup({ name: name.trim(), email: email.trim(), password });
      if (!result.user) {
        setPendingConfirmation(true);
        return;
      }
      router.replace("/home");
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-semibold text-fg">Confirm your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <span className="font-medium text-fg">{email.trim()}</span>. Click it to finish
          creating your account, then sign in.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
          Go to sign in →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 w-fit">
          <LogoMark size={44} />
        </div>
        <h1 className="text-xl font-semibold text-fg">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Start chatting with AI in seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jane Doe"
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
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
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}>
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
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}