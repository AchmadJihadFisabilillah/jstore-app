import postgres from 'postgres';

async function main() {
  const sql = postgres("postgresql://jstore_app:JStoreApp2026!Pass@db.wekxnzbfhwabexrnmwon.supabase.co:5432/postgres?sslmode=require");
  
  console.log("Fixing owner role...");
  const result = await sql`UPDATE "appUsers" SET "role" = 'owner' WHERE "username" = 'owner'`;
  console.log(`Updated ${result.count} rows.`);
  
  const users = await sql`SELECT id, username, role FROM "appUsers"`;
  console.log("Users in DB:", users);
  
  await sql.end();
}

main().catch(console.error);
