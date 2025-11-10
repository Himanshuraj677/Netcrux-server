import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { PLAN_LIMITS } from "../config/plan_limit.js";
import crypto from "crypto";
import { isValidSubdomain } from "./checkValidDomain.js";


export async function registerTunnelForUser(
  userId: number,
  name: string | undefined,
  rootDomain: string
) {
  const [user, activeCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    }),
    prisma.tunnel.count({
      where: { userId, isActive: true },
    }),
  ]);

  if (!user) throw new Error("User not found");

  const plan = user.subscription?.plan || "FREE";
  const planConfig = PLAN_LIMITS[plan];

  if (activeCount >= planConfig.maxActiveTunnels) {
    throw new Error(
      `Tunnel limit reached. (${planConfig.maxActiveTunnels} active allowed)`
    );
  }

  let finalName: string;
  let messages: string[] = [];
  if (name && !planConfig.allowCustomSubdomain) {
    messages.push(`Custom subdomains are not allowed on the ${plan} plan. A random subdomain has been assigned.`);
    // console.warn(
    //   `User ${user.email} attempted to register custom subdomain "${name}" on ${plan} plan.`
    // );
  }
  if (!name || !planConfig.allowCustomSubdomain) {
    finalName = crypto.randomBytes(8).toString("base64").replace(/[+/=]/g, "").toLowerCase().substring(0, 10);
  } else {
    // console.log(`User ${user.email} is registering custom subdomain "${name}"`);
    if (!isValidSubdomain(name)) {
      throw new Error("Invalid subdomain format.");
    }
    const existing = await prisma.tunnel.findUnique({ where: { name } });
    if (existing && existing?.userId === userId) {
      messages.push(`You are re-registering your existing subdomain "${name}". Your tunnel has been reactivated.`);
      // console.log(`User ${user.email} is re-registering their existing subdomain "${name}"`);
    }
    if (existing && existing?.userId !== userId)
      throw new Error("Subdomain already taken by another user.");
    finalName = name;
  }

  const url = `https://${finalName}.${rootDomain}`;

  const now = Date.now();
  const [tunnelResult] = await Promise.allSettled([
    prisma.tunnel.upsert({
      where: { name: finalName },
      update: { isActive: true, lastConnected: new Date(now), url },
      create: { name: finalName, url, userId, isActive: true },
    }),
    redis.hset(`stats:${finalName}`, {
      requests: "0",
      bytes: "0",
      lastSeen: `${now}`,
    }),
  ]);

  if (tunnelResult.status === "rejected") throw tunnelResult.reason;

  return { name: finalName, url, plan, messages };
}

export async function markTunnelInactive(name: string) {
  await Promise.all([
    redis.del(`stats:${name}`),
    prisma.tunnel.updateMany({
      where: { name },
      data: { isActive: false, disconnectedAt: new Date() },
    }),
  ]);
}

export async function incrementStats(name: string, bytes: number) {
  await Promise.all([
    redis.hincrby(`stats:${name}`, "requests", 1),
    redis.hincrby(`stats:${name}`, "bytes", bytes),
    redis.hset(`stats:${name}`, "lastSeen", `${Date.now()}`),
  ]);
}
