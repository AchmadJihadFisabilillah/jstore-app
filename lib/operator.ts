import { getOwnerEmail } from "@/db";
import { parseCookies, verifySessionToken, type AuthUser } from "./auth";

/** Identity is supplied by custom session cookie. */
export async function operatorFromRequest(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  if (cookies.jstore_session) {
    const session = await verifySessionToken(cookies.jstore_session);
    if (session) return session;
  }

  return null;
}

export function visibleRecord<T extends Record<string, unknown>>(record: T, owner: boolean): T {
  const safe = { ...record };
  delete safe.requestFingerprint;
  if (!owner) delete safe.cost;
  return safe;
}
