import { createClient } from "redis";
import type { EngineRequest, EngineResponse, RedisStreamResponse } from "./types/types";
import type { DepthLevel, Balance } from "./types/types";
import { createOrder, getDepth, cancelOrder, getOrder, getUserBalance, getAllOrders, getFills } from "./orders/orderbook-spot.ts";
import { createPerpOrder, getAvailableEquity, getPerpOrders, getPerpPositions, onRamp } from "./orders/orderbook-perp";

const client = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect();

const publisherClient = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect()

const ENGINE_CONSUMER_GROUP = "engine-" + Math.random()
try {
  await client.xGroupCreate("incoming-queue", ENGINE_CONSUMER_GROUP, "$", { MKSTREAM: true })
} catch (err: any) {
  if (!err.messages.includes("BUSY-GROUP")) {
    console.log("Failed to create group:", err)
    process.exit(1)
  }

}

export async function startEngine() {
  while (true) {
    try {
      const response = await client.xReadGroup(
        ENGINE_CONSUMER_GROUP,
        ENGINE_CONSUMER_GROUP,
        [{ key: "incoming-queue", id: ">" }],
        { BLOCK: 0, COUNT: 1 }) as RedisStreamResponse[]
      if (!response) {
        continue;
      }
      const raw = response[0]?.messages[0]
      const request = JSON.parse(raw?.message.data) as EngineRequest
      let responseData: unknown = undefined;
      let errorMessage: string | undefined = undefined;
      try {
        switch (request.messageType) {
          case "create_order":
            const orderData = request;
            responseData = createOrder(orderData);
            break;

          case "cancel_order":
            const cancalData = request;
            responseData = cancelOrder(cancalData);
            break;

          case "get_depth":
            const symbol = request.symbol as string
            responseData = getDepth(symbol);
            break;

          case "get_user_balance":
            const userId = request.userId as string;
            responseData = getUserBalance(userId)
            break;

          case "get_order":
            const orderId = request.orderId as string;
            responseData = getOrder(orderId)
            break;

          case "get_all_orders":
            const allOrdersUserId = request.userId as string;
            responseData = getAllOrders(allOrdersUserId)
            break;

          case "get_fills":
            const fillSymbol = request.symbol as string;
            responseData = getFills(fillSymbol)
            break;

          case "create_perporder":
            const perpOrder = request;
            responseData = createPerpOrder(perpOrder)
            break;

          case "available_equity":
            const equityAvailable = request
            responseData = getAvailableEquity(equityAvailable)
            break;

          case "get_perp_orders":
            const perpOrders = request
            responseData = getPerpOrders(perpOrders)
            break;

          case "onramp":
            const ramp = request
            responseData = onRamp(ramp)
            break;

          case "get_perp_positions":
            const positions = request
            responseData = getPerpPositions(positions)
            break;

          default:
            throw new Error(`Unknown command type: ${request}`);
        }
      } catch (err: any) {
        errorMessage = err.message || "Internal engine error"
      }
      const engineResponse: EngineResponse = {
        loopbackId: request.loopbackId,
        ok: !errorMessage,
        data: responseData,
        error: errorMessage
      };
      console.log("ENGINE RESPONSE:", JSON.stringify(engineResponse))

      if (request.loopbackId) {
        await publisherClient.xAdd(
          "to-backend",
          "*", {
          data: JSON.stringify({ engineResponse })
        })
      }

      /*
      if (request.loopbackId) {
        await publisherClient.lPush(
          request.loopbackId,
          JSON.stringify(engineResponse)
        );
      }
      */

    } catch (err: any) {
      console.error("Critical Engine Error:", err);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

startEngine();
