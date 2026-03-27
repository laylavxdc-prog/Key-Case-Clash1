import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, inventoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const CASE_COST = 10;

const KNIVES = [
  { name: "Rusty Knife", rarity: "common", weight: 40 },
  { name: "Forest Blade", rarity: "uncommon", weight: 25 },
  { name: "Crimson Edge", rarity: "rare", weight: 17 },
  { name: "Shadow Cutter", rarity: "epic", weight: 10 },
  { name: "Golden Blade", rarity: "legendary", weight: 5 },
  { name: "Void Dagger", rarity: "mythical", weight: 2 },
  { name: "Celestial Knife", rarity: "celestial", weight: 1 },
];

function pickKnife() {
  const total = KNIVES.reduce((sum, k) => sum + k.weight, 0);
  let rand = Math.random() * total;
  for (const knife of KNIVES) {
    rand -= knife.weight;
    if (rand <= 0) return knife;
  }
  return KNIVES[0];
}

router.post("/open-case", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.keys < CASE_COST) {
      return res.status(400).json({ error: "Not enough keys" });
    }
    const won = pickKnife();
    await db.update(usersTable).set({ keys: user.keys - CASE_COST }).where(eq(usersTable.id, userId));
    await db.insert(inventoryTable).values({ userId, itemName: won.name, rarity: won.rarity });
    return res.json({ success: true, item: won, keys: user.keys - CASE_COST });
  } catch (err) {
    req.log.error({ err }, "Open case error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/inventory/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });
  try {
    const items = await db.select().from(inventoryTable).where(eq(inventoryTable.userId, userId));
    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Get inventory error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
