import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { intentLoginLabel } from "@/lib/safe-redirect";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string) => Promise<"session" | "confirm">;
  onForgot: () => void;
  error: string | null;
  configured: boolean;
}

export function LoginPage({ onLogin, onSignup, onForgot, error, configured }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // Capture once — login URL intent does not change while this screen is mounted.
  const [intent] = useState(() => new URLSearchParams(window.location.search).get("intent"));
  const subtitle =
    mode === "signup" ? "Create an account (pending approval)" : intentLoginLabel(intent);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    // Creation only — login must accept Auth-valid shorter passwords (emulator/Auth floor may be 6).
    if (mode === "signup" && password.length < PASSWORD_MIN_LENGTH) {
      setLocalError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      setInfo(null);
      return;
    }
    setBusy(true);
    setInfo(null);
    setLocalError(null);
    try {
      if (mode === "login") {
        await onLogin(email.trim(), password);
      } else {
        const result = await onSignup(email.trim(), password);
        if (result === "confirm") {
          setInfo(
            "Check your email to verify your account. After verification your status is pending until an admin approves you.",
          );
        }
        // session path: auth gate will show unapproved / pending
      }
    } catch {
      /* surfaced via error prop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-50 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium tracking-wide text-emerald-800">Landlord Gopher</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">LG Maintenance Portal</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!configured && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Missing <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>. Copy{" "}
              <code>.env.example</code> to <code>.env</code>.
            </p>
          )}
          {(localError || error) && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{localError ?? error}</p>
          )}
          {info && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{info}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : undefined}
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                At least {PASSWORD_MIN_LENGTH} characters.
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy || !configured}>
            {busy
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
                ? "Sign in"
                : "Sign up"}
          </Button>
          {mode === "login" ? (
            <button
              type="button"
              className="w-full text-center text-sm text-emerald-800 underline-offset-2 hover:underline"
              onClick={onForgot}
            >
              Forgot password?
            </button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              After email verification an admin must approve your account before you can use the
              portal.
            </p>
          )}
          <button
            type="button"
            className="w-full text-center text-sm text-slate-600 underline-offset-2 hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setInfo(null);
              setLocalError(null);
            }}
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
