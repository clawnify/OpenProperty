import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

interface RequestProps {
  onSubmit: (email: string) => Promise<void>;
  onBack: () => void;
  error: string | null;
}

export function ResetRequestPage({ onSubmit, onBack, error }: RequestProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await onSubmit(email.trim());
      setSent(true);
    } catch {
      /* error prop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          We’ll email a link to set a new password.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {sent ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            If that email exists, a reset link is on its way.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          {!sent && (
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

interface ConfirmProps {
  onSubmit: (password: string) => Promise<void>;
  onDone: () => void;
  error: string | null;
}

export function ResetConfirmPage({ onSubmit, onDone, error }: ConfirmProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setLocalError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await onSubmit(password);
      onDone();
    } catch {
      /* error prop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        {(localError || error) && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{localError ?? error}</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <p className="text-xs text-muted-foreground">
            At least {PASSWORD_MIN_LENGTH} characters.
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
