import {default as Redis} from "ioredis";
const redis_url = process.env.REDIS_URL;

if (!redis_url) {
  throw new Error("REDIS_URL is not defined in environment variables.");
}
export const redis = new Redis.default(redis_url);
