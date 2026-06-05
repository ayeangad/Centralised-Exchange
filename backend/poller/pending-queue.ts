import { createClient } from "redis"
import type { RedisStreamResponse, ToEngine } from "../../engine/types/types";


const client = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect()

const subscriber = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect()

const BACKEND_CONSUMER_GROUP = `backend-${Math.random().toString(36).substring(7)}`;

try {
  await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP, "$", { MKSTREAM: true })
} catch (err: any) {
  if (!err.message.includes('BUSYGROUP')) {
    console.error("Failed to create group:", err)
    process.exit(1)
  }
}

const loopBackResolves = new Map<string, (value: unknown) => void>()

export function loopback(message: ToEngine) {
  return new Promise(async (resolve, reject) => {
    const loopbackId = Math.random().toString();
    await client.xAdd("incoming-queue", "*", {
      data: JSON.stringify({ ...message, loopbackId })
    })
    loopBackResolves.set(loopbackId, resolve)
    setTimeout(() => {
      if (loopBackResolves.get(loopbackId)) {
        reject(new Error("Loopback timeout - engine did not respond within 10s"));
        loopBackResolves.delete(loopbackId)
      }
    }, 10000);

  })
}

async function main() {
  while (true) {
    const response = await subscriber.xReadGroup(
      BACKEND_CONSUMER_GROUP,
      BACKEND_CONSUMER_GROUP,
      [{ key: "to-backend", id: ">" }],
      { BLOCK: 0, COUNT: 1 }) as RedisStreamResponse[] | null

    if (!response || response.length === 0) continue;
    const raw = response[0]?.messages?.[0]
    if (!raw) continue

    const parsed = JSON.parse(raw.message.data)
    const loopbackId = parsed.loopbackId
    if (!loopbackId) continue

    loopBackResolves.get(loopbackId)?.(raw.message.data)
    loopBackResolves.delete(loopbackId)
  }
}

main()


