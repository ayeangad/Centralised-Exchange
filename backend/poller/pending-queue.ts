import { createClient } from "redis"
export const QUEUE_ID = Math.random();
import type { EngineResponse } from "../../engine/types/types"

let pendingResolves = {}

const subscriber = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect()


export async function pollQueue() {
  const response = await subscriber.brPop("response-queue-" + QUEUE_ID, 5)
  if (!response) {
    console.log(response)
    pollQueue();
  } else {
    const parsedResponse = JSON.parse(response.element)
    if (parsedResponse.identifier && pendingResolves[parsedResponse.identifier]) {
      pendingResolves[parsedResponse.identifier](parsedResponse)
    }
    pollQueue();
  }
}

pollQueue()

export function pendingQueues(identifier: number): Promise<EngineResponse> {
  return new Promise((resolve, reject) => {
    pendingResolves[identifier] = resolve;
  })
}

