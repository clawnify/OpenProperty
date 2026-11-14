/**
 * UI password minimum for **password creation** (signup + reset-confirm).
 * Login must not use this — Auth/emulator may still accept shorter existing passwords.
 * Match Supabase Auth minimum length once set in the dashboard (≥8).
 * Agents cannot flip Auth settings; see docs/ops/auth-password-policy.md.
 */
export const PASSWORD_MIN_LENGTH = 8;
