import { z } from "zod";
import { getInventoryDb, ensureDbSchema } from "@/db";
import { operatorFromRequest } from "@/lib/operator";
import { verifyCredentials } from "@/lib/auth";

const changeOwnerPassSchema = z.object({
  action: z.literal("change_owner_password"),
  oldPassword: z.string().trim().min(1, "Password lama wajib diisi"),
  newPassword: z.string().trim().min(4, "Password baru minimal 4 karakter"),
});

const createAdminSchema = z.object({
  action: z.literal("create_admin"),
  username: z.string().trim().min(3, "Username minimal 3 karakter").max(30).regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, titik, minus, dan underscore"),
  name: z.string().trim().min(1, "Nama lengkap wajib diisi").max(50),
  password: z.string().trim().min(4, "Password minimal 4 karakter").max(50),
});

const deleteAdminSchema = z.object({
  action: z.literal("delete_admin"),
  id: z.string().trim().min(1),
});

const schema = z.discriminatedUnion("action", [
  changeOwnerPassSchema,
  createAdminSchema,
  deleteAdminSchema,
]);

export async function GET(request: Request) {
  try {
    const operator = await operatorFromRequest(request);
    if (!operator) {
      return Response.json({ error: "Sesi masuk tidak ditemukan." }, { status: 401 });
    }
    if (operator.role !== "owner") {
      return Response.json({ error: "Hanya Owner yang dapat melihat daftar pengguna." }, { status: 403 });
    }

    const db = getInventoryDb();
    await ensureDbSchema(db);
    const result = await db.prepare('SELECT "id", "username", "name", "role", "createdAt" FROM "appUsers" ORDER BY CASE WHEN "role" = \'owner\' THEN 0 ELSE 1 END, "createdAt" ASC').all();

    return Response.json({ users: result.results || [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Gagal memuat data pengguna." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const operator = await operatorFromRequest(request);
    if (!operator) {
      return Response.json({ error: "Sesi masuk tidak ditemukan." }, { status: 401 });
    }
    if (operator.role !== "owner") {
      return Response.json({ error: "Hanya Owner yang memiliki izin ini." }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Format data tidak valid." }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Data tidak valid." },
        { status: 400 }
      );
    }

    const db = getInventoryDb();
    await ensureDbSchema(db);
    const data = parsed.data;
    const now = new Date().toISOString();

    if (data.action === "change_owner_password") {
      // Check current password from db or fallback
      const existingOwner = await db.prepare('SELECT * FROM "appUsers" WHERE "username" = \'owner\'').first<{ id: string; password: string }>();
      let isOldPassValid = false;

      if (existingOwner) {
        isOldPassValid = existingOwner.password === data.oldPassword;
      } else {
        const check = verifyCredentials("owner", "owner", data.oldPassword);
        isOldPassValid = check.valid;
      }

      if (!isOldPassValid) {
        return Response.json({ error: "Password lama Owner salah." }, { status: 400 });
      }

      if (existingOwner) {
        await db.prepare('UPDATE "appUsers" SET "password" = $1 WHERE "id" = $2').bind(data.newPassword, existingOwner.id).run();
      } else {
        await db.prepare('INSERT INTO "appUsers" ("id", "username", "name", "password", "role", "createdAt") VALUES ($1, \'owner\', \'Owner\', $2, \'owner\', $3)').bind(crypto.randomUUID(), data.newPassword, now).run();
      }

      return Response.json({ ok: true, message: "Password Owner berhasil diubah." });
    }

    if (data.action === "create_admin") {
      const u = data.username.toLowerCase();
      if (u === "owner") {
        return Response.json({ error: "Username 'owner' sudah digunakan khusus untuk Owner." }, { status: 400 });
      }

      const existing = await db.prepare('SELECT "id" FROM "appUsers" WHERE "username" = $1').bind(u).first();
      if (existing) {
        return Response.json({ error: `Username '${data.username}' sudah terdaftar.` }, { status: 409 });
      }

      const id = `admin-${crypto.randomUUID().slice(0, 8)}`;
      await db.batch([
        db.prepare('INSERT INTO "appUsers" ("id", "username", "name", "password", "role", "createdAt") VALUES ($1, $2, $3, $4, \'admin\', $5)').bind(id, u, data.name, data.password, now),
        db.prepare('INSERT INTO activities ("id", "kind", "message", "quantity", "createdAt") VALUES ($1, \'edit\', $2, 0, $3)').bind(crypto.randomUUID(), `Admin dibuat: ${data.name} (@${u})`, now),
      ]);

      return Response.json({ ok: true, id, message: "Admin baru berhasil dibuat." });
    }

    if (data.action === "delete_admin") {
      const existing = await db.prepare('SELECT "id", "name", "username", "role" FROM "appUsers" WHERE "id" = $1').bind(data.id).first<{ id: string; name: string; username: string; role: string }>();
      if (!existing) {
        return Response.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
      }
      if (existing.role === "owner" || existing.username === "owner") {
        return Response.json({ error: "Akun Owner tidak dapat dihapus." }, { status: 400 });
      }

      await db.batch([
        db.prepare('DELETE FROM "appUsers" WHERE "id" = $1').bind(data.id),
        db.prepare('INSERT INTO activities ("id", "kind", "message", "quantity", "createdAt") VALUES ($1, \'delete\', $2, 0, $3)').bind(crypto.randomUUID(), `Admin dihapus: ${existing.name} (@${existing.username})`, now),
      ]);

      return Response.json({ ok: true, message: "Admin berhasil dihapus." });
    }

    return Response.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch {
    return Response.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}
