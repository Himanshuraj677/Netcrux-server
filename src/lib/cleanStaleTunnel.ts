import { prisma } from "../config/db.js";

export async function cleanupStaleTunnels() {
  try {
    const result = await prisma.tunnel.updateMany({
      where: { isActive: true },
      data: { isActive: false, disconnectedAt: new Date() },
    });
    console.log(`🧹 Cleaned up ${result.count} stale tunnels on startup`);
  } catch (err) {
    console.error("Error cleaning up tunnels on startup:", err);
  }
}