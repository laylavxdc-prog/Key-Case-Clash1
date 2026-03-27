import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, inventoryTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

const CASE_COST = 10;

const KNIVES = [
  { name: "Rusty Knife",     rarity: "common",    value: 5   },
  { name: "Forest Blade",    rarity: "uncommon",  value: 15  },
  { name: "Crimson Edge",    rarity: "rare",      value: 25  },
  { name: "Shadow Cutter",   rarity: "epic",      value: 40  },
  { name: "Golden Blade",    rarity: "legendary", value: 60  },
  { name: "Void Dagger",     rarity: "mythical",  value: 80  },
  { name: "Celestial Knife", rarity: "celestial", value: 100 },
];

function pickKnife() {
  return KNIVES[Math.floor(Math.random() * KNIVES.length)];
}

export { KNIVES };

router.post("/open-case", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.keys < CASE_COST) return res.status(400).json({ error: "Not enough keys" });
    const won = pickKnife();
    await db.update(usersTable).set({ keys: user.keys - CASE_COST }).where(eq(usersTable.id, userId));
    const [invItem] = await db.insert(inventoryTable).values({ userId, itemName: won.name, rarity: won.rarity, value: won.value }).returning();
    return res.json({ success: true, item: { ...won, id: invItem.id }, keys: user.keys - CASE_COST });
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

router.post("/withdraw", async (req, res) => {
  const { userId, itemIds } = req.body;
  if (!userId || !itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: "userId and itemIds required" });
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const items = await db.select().from(inventoryTable)
      .where(inArray(inventoryTable.id, itemIds));

    const ownedItems = items.filter(i => i.userId === userId);
    if (ownedItems.length === 0) return res.status(400).json({ error: "No valid items" });

    const totalValue = ownedItems.reduce((sum, i) => sum + i.value, 0);
    const itemList = ownedItems.map(i => `• ${i.itemName} — ${i.value} Robux`).join("\n");

    const webhookPayload = {
      embeds: [{
        title: "🔪 KnifeCase Withdrawal",
        color: 0xf0bf30,
        fields: [
          { name: "👤 Player", value: user.username, inline: true },
          { name: "💰 Total Value", value: `${totalValue} Robux`, inline: true },
          { name: "📦 Items", value: itemList, inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "KnifeCase Withdrawals" },
      }],
    };

    try {
      await fetch("https://discord.com/api/webhooks/1486783614388666448/yTR9D5E-hSwzP2Yn2am1ig81dWMDrDpCzlS-yXTTH_OrX3xvw-j4C4QDWuSgk9FFpBDN", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });
    } catch (webhookErr) {
      req.log.warn({ webhookErr }, "Discord webhook failed");
    }

    await db.delete(inventoryTable).where(inArray(inventoryTable.id, ownedItems.map(i => i.id)));
    return res.json({ success: true, totalValue, withdrawn: ownedItems.length });
  } catch (err) {
    req.log.error({ err }, "Withdraw error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
