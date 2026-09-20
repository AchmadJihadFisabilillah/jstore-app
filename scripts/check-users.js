import { getInventoryDb } from './db/index.js';
async function main() {
    const db = getInventoryDb();
    const users = await db.prepare('SELECT * FROM "appUsers"').all();
    console.log("Users:", JSON.stringify(users.results, null, 2));
    // Fix owner role if needed
    await db.prepare('UPDATE "appUsers" SET "role" = \'owner\' WHERE "username" = \'owner\'').run();
    const usersAfter = await db.prepare('SELECT * FROM "appUsers"').all();
    console.log("Users After:", JSON.stringify(usersAfter.results, null, 2));
}
main().catch(console.error);
