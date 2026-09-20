import { z } from "zod";
import { getInventoryDb, ensureDbSchema } from "@/db";
import {
  createSessionToken,
  createSessionCookieHeader,
  verifyCredentials,
  type AuthUser,
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi"),
  password: z.string().trim().min(1, "Password wajib diisi"),
  role: z.enum(["owner", "admin"]).optional(),
});

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Data login tidak lengkap." },
        { status: 400 }
      );
    }

    const { username, password, role } = parsed.data;
    const u = username.toLowerCase();
    const targetRole = u === "owner" ? "owner" : (role || "admin");

    let authenticatedUser: AuthUser | null = null;

    try {
      const db = getInventoryDb();
      await ensureDbSchema(db);
      const dbUser = await db
        .prepare('SELECT "id", "username", "name", "password", "role" FROM "appUsers" WHERE LOWER("username") = $1')
        .bind(u)
        .first<{ id: string; username: string; name: string; password: string; role: "owner" | "admin" }>();

      if (dbUser) {
        if (dbUser.password === password) {
          authenticatedUser = {
            id: dbUser.id,
            name: dbUser.name,
            role: (u === "owner" || dbUser.username.toLowerCase() === "owner" || dbUser.role === "owner") ? "owner" : "admin",
          };
        }
      }
    } catch {
      // Ignore database query failure and fall back
    }

    if (!authenticatedUser) {
      const fallback = verifyCredentials(targetRole, username, password);
      if (fallback.valid && fallback.user) {
        authenticatedUser = fallback.user;
      }
    }

    if (!authenticatedUser) {
      return Response.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    const token = await createSessionToken(authenticatedUser);
    const cookieHeader = createSessionCookieHeader(token);

    return Response.json(
      { ok: true, user: authenticatedUser },
      {
        status: 200,
        headers: {
          "Set-Cookie": cookieHeader,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return Response.json({ error: "Terjadi kesalahan saat login." }, { status: 500 });
  }
}
