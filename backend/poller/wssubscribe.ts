import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const wss = new WebSocketServer({ port: 3001 });
const subscriber = createClient({ url: process.env.REDIS_URL })
await subscriber.connect()

const subscribers = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws) => {
  const mySubscriptions = new Set<string>();
  ws.on("message", async (data: string) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "subscribe") {
      const key = `depth:${msg.symbol}`;
      mySubscriptions.add(key)
      const isFirstSubscriber = !subscribers.has(key)

      if (isFirstSubscriber) subscribers.set(key, new Set());
      subscribers.get(key)!.add(ws);

      if (isFirstSubscriber) {
        try {
          await subscriber.subscribe(key, (message) => {
            const data = JSON.parse(message);
            const clients = subscribers.get(key);

            clients?.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "depth_update", symbol: msg.symbol, ...data }))
              }
            });
          })
        } catch (err) {
          console.error(err)
          subscribers.delete(key)
        }
      }
    }
  })

  ws.on("close", () => {
    for (const key of mySubscriptions) {
      const room = subscribers.get(key)
      if (room) {
        room.delete(ws);
        if (room.size === 0) {
          subscribers.delete(key);
          subscriber.unsubscribe(key);
        }
      }
    }
  })
})



