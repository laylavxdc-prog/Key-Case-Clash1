import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "knifecase_salt_2024").digest("hex");
}

async function seedAdmin() {
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
    if (!existing) {
      await db.insert(usersTable).values({
        username: "admin",
        password: hashPassword("KnifeAdmin123"),
        keys: 999999,
        isAdmin: true,
      });
      logger.info("Admin user created");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed admin");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  await seedAdmin();
});
