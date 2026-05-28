import { ORDERBOOK, type RestingOrder } from '../types/types.ts'
import WebSocket, { WebSocketServer } from "ws";
import { createClient } from "redis";
import { getAllOrders } from './orderbook.ts';

const publisher = createClient({ url: process.env.REDIS_URL });
await publisher.connect()

export function publishDepth(symbol: string) {
  const orderbook = ORDERBOOK[symbol]
  if (!orderbook) return;

  const aggregateSide = (orders: RestingOrder[]) => {
    const counts: Record<number, number> = {};
    orders.forEach(o => {
      counts[o.price] = (counts[o.price] || 0) + o.qty;
    });
    return Object.entries(counts).map(([price, qty]) => [Number(price), qty]);
  }

  const bids = aggregateSide(orderbook.bids).sort(([a], [b]) => b - a);
  const asks = aggregateSide(orderbook.asks).sort(([a], [b]) => a - b);


  publisher.publish(`depth:${symbol}`, JSON.stringify({ bids, asks }))
}

