import {default as Redis} from "ioredis";
const redis_url = process.env.REDIS_URL;

if (!redis_url) {
  throw new Error("REDIS_URL is not defined in environment variables.");
}
const redis = new Redis.default(redis_url);

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

export { redis };
