"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Field, FormError, Spinner } from "@/components/ui";
import { validateChangePassword } from "@/lib/validation";
import { formatDate } from "@/lib/utils";

export default function SecuritySettingsPage() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const { data: sessions, isError: sessionsError, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.auth.listSessions(),
  });
  const [revokingOthers, setRevokingOthers] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateChangePassword({ currentPassword, newPassword, confirmPassword });
    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ kind: "success", title: "Password changed" });
      void refetch();
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const revokeOthers = async () => {
    setRevokingOthers(true);
    try {
      await api.auth.logoutOthers();
      void refetch();
      toast({ kind: "success", title: "Other sessions signed out" });
    } catch (error) {
      toast({ kind: "error", title: "Could not sign out other sessions", description: errorMessage(error) });
    } finally {
      setRevokingOthers(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Change password</h2>
        <p className="mt-1 text-sm text-muted">Use a strong password you don&apos;t reuse elsewhere.</p>
        <form onSubmit={handleChangePassword} className="mt-5 space-y-4" noValidate>
          <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword}>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(errors.currentPassword)}
            />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword} hint="At least 8 characters.">
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(errors.newPassword)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
          </Field>
          <FormError message={errors.form} />
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Update password</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Active sessions</h2>
            <p className="mt-1 text-sm text-muted">Devices currently signed in to your account.</p>
          </div>
          <Button variant="outline" onClick={revokeOthers} loading={revokingOthers}>
            Sign out other sessions
          </Button>
        </div>

        <div className="mt-5">
          {sessionsError ? (
            <p className="text-sm text-danger">Could not load sessions.</p>
          ) : !sessions ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : sessions.sessions.length === 0 ? (
            <p className="text-sm text-muted">No active sessions.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.sessions.map((session) => (
                <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {session.userAgent ?? "Unknown device"}
                      {session.current ? <span className="ml-2 text-xs font-normal text-accent">This device</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {session.ip ?? "Unknown IP"} · Signed in {formatDate(session.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-muted">Expires {formatDate(session.expiresAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="border-danger/30 p-6">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">Sign out of this device. Your conversations remain saved.</p>
        <div className="mt-4">
          <Button variant="danger" onClick={() => logout()}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}