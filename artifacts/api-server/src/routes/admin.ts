import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, ne } from "drizzle-orm";

const router: IRouter = Router();

async function requireAdmin(userId: number): Promise<boolean> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user?.isAdmin === true;
}

router.get("/users", async (req, res) => {
  const adminId = parseInt(req.query.adminId as string);
  if (isNaN(adminId)) return res.status(400).json({ error: "adminId required" });
  try {
    if (!await requireAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });
    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      keys: usersTable.keys,
      isAdmin: usersTable.isAdmin,
    }).from(usersTable).where(ne(usersTable.isAdmin, true));
    return res.json({ users });
  } catch (err) {
    req.log.error({ err }, "Admin get users error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/give-keys", async (req, res) => {
  const { adminId, targetUserId, amount } = req.body;
  if (!adminId || !targetUserId || amount === undefined) {
    return res.status(400).json({ error: "adminId, targetUserId, amount required" });
  }
  const parsedAmount = parseInt(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }
  try {
    if (!await requireAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
    if (!target) return res.status(404).json({ error: "Target user not found" });
    const newKeys = target.keys + parsedAmount;
    await db.update(usersTable).set({ keys: newKeys }).where(eq(usersTable.id, targetUserId));
    return res.json({ success: true, username: target.username, newKeys });
  } catch (err) {
    req.log.error({ err }, "Give keys error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
