import { ORDERBOOK } from '../types/types.ts'
import WebSocket, { WebSocketServer } from "ws";
import { createClient } from "redis";

const publisher = createClient({ url: process.env.REDIS_URL });
await publisher.connect()

function publishDepth(symbol: string) {
  const orderbook = ORDERBOOK[symbol]
  if (!orderbook) throw new Error("Doesn't Exist!")

  const bids = Object.entries(orderbook.bids)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([price, orders]) => [
      price,
      orders.reduce((sum: number, o: any) => sum + o.qty, 0)
    ])

  const asks = Object.entries(orderbook.asks)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([price, orders]) => [
      price,
      orders.reduce((sum: number, o: any) => sum + o.qty, 0)
    ])


  publisher.publish(`depth:${symbol}`, JSON.stringify({ bids, asks }))
}

