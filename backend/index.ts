import jwt from "jsonwebtoken"
import express from "express"
import bcrypt from "bcrypt"
import { authMiddleware } from "./auth/middleware.ts"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma"
import { loopback } from "./poller/pending-queue.ts"
import z from "zod"
import { BALANCES, STOCKS } from "../engine/types/types.ts"
import { env } from "./auth/env.ts"
import { quotelessJson } from "zod/v3"


const adapter = new PrismaPg({ connectionString: env.databaseUrl })
const prisma = new PrismaClient({ adapter });
const app = express();
app.use(express.json());


export const SignupSchema = z.object({
  username: z.string().trim().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
})

app.post("/signup", async (req, res) => {
  const { data, success } = SignupSchema.safeParse(req.body)
  if (!success) {
    res.status(403).json({ message: "Incorrect Inputs" })
    return;
  }

  const { username, password } = data;
  const userExists = await prisma.user.findUnique({ where: { username } })
  if (userExists) {
    res.status(403).json({
      message: "Username already exists!"
    })
    return;
  }

  const hashPassword = await bcrypt.hash(password, 10)
  await prisma.user.create({
    data: {
      username: username,
      password: hashPassword
    }
  })
  res.json({ message: "Signed Up!" })
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body
  const userExists = await prisma.user.findUnique({ where: { username } })

  if (!userExists) {
    res.status(403).json({
      message: "User doesn't exists!"
    });
    return;
  }

  const correctPassword = await bcrypt.compare(password, userExists.password)

  if (!correctPassword) {
    res.status(403).json({
      message: "Incorrect password!"
    })
    return;
  }

  const token = jwt.sign({
    userId: userExists.id
  }, env.jwtSecret)

  res.json({
    token
  })
});

app.post("/spot/order", authMiddleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) return;
  const { side, type, symbol, price, qty } = req.body;
  const queueLoopbackResponse = await loopback({
    messageType: "create_order", userId, side, type, symbol, price, qty
  })
  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }
  res.json({ message: "Order Placed!", data: queueLoopbackResponse })
});

app.post("/admin/market", async (req, res) => {
  const token = req.headers.authorization
  if (token !== env.adminSecret) {
    res.status(401).json()
    return;
  }
  const { symbol, imageUrl } = req.body;
  const response = await prisma.market.upsert({
    where: { slug: symbol },
    update: { imageUrl },
    create: { slug: symbol, imageUrl },
  });
  const start = performance.now();
  const queueLoopbackResponse = await loopback({
    messageType: "create_market",
    marketId: response.id
  });
  const end = performance.now();
  console.log(`Matching engine latency: ${(end - start).toFixed(2)}ms`);

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Market created!", id: response.id });
});

app.delete("/spot/order/:orderId", authMiddleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) return
  const orderId = req.params.orderId
  if (!orderId) return;

  const queueLoopbackResponse = await loopback({
    messageType: "cancel_order", userId, orderId: String(orderId)
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Order Cancalled!", data: queueLoopbackResponse })
});

app.get("/orders", authMiddleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) return

  const queueLoopbackResponse = await loopback({
    messageType: "get_all_orders", userId
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "All your orders!", data: queueLoopbackResponse.data })
});

app.get("/orders/:orderId", authMiddleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) return;
  const orderId = req.params.orderId

  const queueLoopbackResponse = await loopback({
    messageType: "get_order", userId, orderId: String(orderId)
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Here is your order details!", data: queueLoopbackResponse })
});

app.get("/orderbook/:symbol", authMiddleware, async (req, res) => {
  const symbol = req.params.symbol

  const queueLoopbackResponse = await loopback({
    messageType: "get_depth", symbol: String(symbol)
  })

  res.json({ message: `${symbol} details`, data: queueLoopbackResponse })
});

app.get("/fills/:symbol", authMiddleware, async (req, res) => {
  const symbol = req.params.symbol

  const queueLoopbackResponse = await loopback({
    messageType: "get_fills", symbol: String(symbol)
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }
  res.json({ message: `${symbol} fills`, data: queueLoopbackResponse })
});

app.post("/perps/order", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return;
  const { symbol, side, type, intent, qty, margin, price, leverage } = req.body

  const queueLoopbackResponse = await loopback({
    messageType: "create_perporder", userId, symbol, side, type, intent, qty, margin, price, leverage
  })
  if (!queueLoopbackResponse) {
    res.status(401).json({ message: "Loopback failed" })
    return;
  }

  res.json({ message: "Order Placed!", data: queueLoopbackResponse })
})

app.post("/perps/cancel-order", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return;
  const { orderId } = req.body

  const queueLoopbackResponse = await loopback({
    messageType: "cancel_order", userId, orderId
  })
  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Couldn't cancel order" })
  }

  res.json({ message: "Order Cancelled", data: queueLoopbackResponse })
})

app.get("/equity/available", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return;

  const queueLoopbackResponse = loopback({
    messageType: "available_equity", userId
  })
  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Here is your available equity!", data: queueLoopbackResponse })
})

app.get("/perps/orders", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return

  const queueLoopbackResponse = await loopback({
    messageType: "get_perp_orders", userId
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "No order history!" })
  }

  res.json({ message: "Your perp order history", data: queueLoopbackResponse })

})

app.post("/onramp", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return;
  const { amount } = req.body

  console.log("hello")
  const queueLoopbackResponse = await loopback({
    messageType: "onramp", userId, amount
  })
  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Couldnt add!" })
  }

  res.json({ message: "Your new balance", data: queueLoopbackResponse })

})


app.get("/perps/position", authMiddleware, async (req, res) => {
  const userId = req.userId
  if (!userId) return;

  const queueLoopbackResponse = await loopback({
    messageType: "get_perp_positions", userId
  })
  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "No perp positions" })
  }

  res.json({ message: "Your perp positions", data: queueLoopbackResponse })

})


app.get("/stocks", (req, res) => {
  res.json({ data: STOCKS });
});

app.get("/balance", authMiddleware, async (req, res) => {
  const userId = req.userId;
  if (!userId) return;

  const queueLoopbackResponse = await loopback({
    messageType: "get_user_balance", userId
  })

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Here is your balance", data: queueLoopbackResponse })
});

app.listen(3000, () => console.log("CEX running on :3000"));
