import express from "express";
import { prisma } from "../config/db.js";

const router = express.Router();

router.post("/user/:id/upgrade", async (req, res) => {
  const { id } = req.params;
  const { plan, expiresAt } = req.body;
  if (!["FREE", "BASIC", "PRO", "ENTERPRISE"].includes(plan))
    return res.status(400).json({ message: "Invalid plan" });

  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user) return res.status(404).json({ message: "User not found" });

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: { plan, expiresAt: expiresAt ? new Date(expiresAt) : null },
    create: {
      userId: user.id,
      plan,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  res.json({ message: `User upgraded to ${plan}` });
});

export default router;
