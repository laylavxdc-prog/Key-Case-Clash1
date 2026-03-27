import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "knifecase_salt_2024").digest("hex");
}

router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      return res.status(400).json({ error: "Username already taken" });
    }
    const hashed = hashPassword(password);
    const [user] = await db.insert(usersTable).values({ username, password: hashed }).returning();
    return res.json({ success: true, user: { id: user.id, username: user.username, keys: user.keys } });
  } catch (err) {
    req.log.error({ err }, "Register error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  try {
    const hashed = hashPassword(password);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!user || user.password !== hashed) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    return res.json({ success: true, user: { id: user.id, username: user.username, keys: user.keys } });
  } catch (err) {
    req.log.error({ err }, "Login error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/user/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, username: user.username, keys: user.keys });
  } catch (err) {
    req.log.error({ err }, "Get user error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
