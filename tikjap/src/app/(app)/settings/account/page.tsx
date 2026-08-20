"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Field, FormError, Spinner } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { validateAccountEmail, validateAccountName } from "@/lib/validation";

export default function AccountSettingsPage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  if (!user) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const memberSinceYear = user.createdAt ? new Date(user.createdAt).getFullYear() : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: { name?: string; email?: string } = {};
    const nameError = validateAccountName(name);
    const emailError = validateAccountEmail(email);
    if (nameError) errors.name = nameError;
    if (emailError) errors.email = emailError;
    if (Object.keys(errors).length) {
      setErrors(errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.users.update({ name: name.trim(), email: email.trim() });
      await refresh();
      toast({ kind: "success", title: "Account updated" });
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={name} size="lg" />
          <div>
            <p className="text-base font-semibold text-fg">{name || "Your account"}</p>
            <p className="text-sm text-muted">
              {memberSinceYear ? `Member since ${memberSinceYear}` : user.email}
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Display name" htmlFor="name" error={errors.name}>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email} hint="Used to sign in and receive notifications.">
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} />
          </Field>
          <FormError message={errors.form} />
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}