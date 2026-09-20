export interface AuthUser {
  id: string;
  name: string;
  role: "owner" | "admin";
}

const AUTH_SECRET = process.env.JSTORE_AUTH_SECRET || "jstore-auth-secret-key-2026";
const COOKIE_NAME = "jstore_session";

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = base64UrlEncode(signature);

  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;

    const encoder = new TextEncoder();
    const key = await getCryptoKey();
    const signature = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;

    const decoder = new TextDecoder();
    const payloadJson = decoder.decode(base64UrlDecode(payloadB64));
    const data = JSON.parse(payloadJson);

    if (data.exp && Date.now() > data.exp) return null;
    if (!data.id || !data.name || (data.role !== "owner" && data.role !== "admin")) return null;

    return {
      id: data.id,
      name: data.name,
      role: data.role,
    };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const [k, ...vs] = pair.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(vs.join("="));
  });
  return cookies;
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function createSessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
}

export function createLogoutCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function verifyCredentials(
  role: "owner" | "admin",
  username: string,
  password: string
): { valid: boolean; user?: AuthUser } {
  const u = username.trim();
  const p = password.trim();
  if (!u || !p) return { valid: false };

  if (role === "owner") {
    const isValidPass =
      p === "owner123" ||
      p === "password123" ||
      p === "123456" ||
      (typeof process !== "undefined" && Boolean(process.env?.JSTORE_OWNER_PASSWORD && process.env.JSTORE_OWNER_PASSWORD === p));

    if (!isValidPass) return { valid: false };
    return {
      valid: true,
      user: {
        id: "owner-id",
        name: u.toLowerCase() === "owner" ? "Owner" : u,
        role: "owner",
      },
    };
  }

  if (role === "admin") {
    const isValidPass =
      p === "admin123" ||
      p === "password123" ||
      p === "1234" ||
      (typeof process !== "undefined" && Boolean(process.env?.JSTORE_ADMIN_PASSWORD && process.env.JSTORE_ADMIN_PASSWORD === p));

    if (!isValidPass) return { valid: false };
    const sanitized = u.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    return {
      valid: true,
      user: {
        id: `admin-${sanitized || crypto.randomUUID().slice(0, 8)}`,
        name: u,
        role: "admin",
      },
    };
  }

  return { valid: false };
}
