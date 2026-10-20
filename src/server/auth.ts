import { run, get } from "./db";

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  plan: string;
  status?: string;
  plan_expires_at?: string | null;
  created_at: string;
}

export interface SessionUser {
  user: User;
  token: string;
}

// ── Web Crypto Password Hashing (PBKDF2-SHA256) ───────────────────

function buf2hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex2buf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = buf2hex(saltBytes.buffer);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hash = buf2hex(derivedBits);
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const saltBytes = hex2buf(salt);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const checkHash = buf2hex(derivedBits);
  return checkHash === hash;
}

// ── Session Management ─────────────────────────────────────────────

export async function createSession(userId: number): Promise<string> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = buf2hex(tokenBytes.buffer);

  // Expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await run(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, expiresAt]
  );

  return token;
}

export async function getSessionUser(token: string): Promise<User | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await get<User & { expires_at: string; status?: string }>(
    `SELECT u.id, u.email, u.name, u.phone, u.role, COALESCE(u.plan, 'free') as plan, COALESCE(u.status, 'active') as status, u.plan_expires_at, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, now]
  );
  if (!row || row.status === "cancelled") return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    plan: row.plan || "free",
    status: row.status || "active",
    plan_expires_at: row.plan_expires_at ?? null,
    created_at: row.created_at,
  };
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await run("DELETE FROM sessions WHERE token = ?", [token]);
}
