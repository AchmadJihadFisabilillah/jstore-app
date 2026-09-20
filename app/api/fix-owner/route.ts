import { getInventoryDb } from "@/db";

export async function GET() {
  const db = getInventoryDb();
  
  // Fix owner role
  await db.prepare('UPDATE "appUsers" SET "role" = \'owner\' WHERE "username" = \'owner\'').run();
  
  const users = await db.prepare('SELECT * FROM "appUsers"').all();
  return Response.json({ success: true, users: users.results });
}
