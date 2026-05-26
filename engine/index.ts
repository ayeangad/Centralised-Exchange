import { createClient } from "redis";
import type { CreateOrder, EngineRequest, EngineResponse } from "./types/types";
import type { CancelOrder, DepthLevel, Balance } from "./types/types";
import { createOrder, getDepth, cancelOrder, getOrder, getUserBalance, getAllOrders, getFills } from "./orders/matching";

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



export async function startEngine() {
  while (true) {
    try {
      const response = await client.brPop("incoming-queue", 1);
      if (!response) {
        continue;
      }
      const request = JSON.parse(response.element) as EngineRequest
      let responseData: unknown = undefined;
      let errorMessage: string | undefined = undefined;
      try {
        switch (request.type) {
          case "create_order":
            const orderData = request.payload as unknown as CreateOrder;
            responseData = createOrder(orderData);
            break;

          case "cancel_order":
            const cancalData = request.payload as unknown as CancelOrder;
            responseData = cancelOrder(cancalData);
            break;

          case "get_depth":
            const symbol = request.payload.symbol as string
            responseData = getDepth(symbol);
            break;

          case "get_user_balance":
            const userId = request.payload.userId as string;
            responseData = getUserBalance(userId)
            break;

          case "get_order":
            const orderId = request.payload.orderId as string;
            responseData = getOrder(orderId)
            break;

          case "get_all_orders":
            const allOrdersUserId = request.payload.userId as string;
            responseData = getAllOrders(allOrdersUserId)
            break;

          case "get_fills":
            const fillSymbol = request.payload.symbol as string;
            responseData = getFills(fillSymbol)
            break;

          default:
            throw new Error(`Unknown command type: ${request.type}`);
        }
      } catch (err: any) {
        errorMessage = err.message || "Internal engine error"
      }
      const engineResponse: EngineResponse = {
        identifier: request.identifier,
        ok: !errorMessage,
        data: responseData,
        error: errorMessage
      };
      console.log("ENGINE RESPONSE:", JSON.stringify(engineResponse))

      if (request.responseQueue) {
        await publisherClient.lPush(
          request.responseQueue,
          JSON.stringify(engineResponse)
        );
      }
    } catch (err: any) {
      console.error("Critical Engine Error:", err);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

startEngine();
