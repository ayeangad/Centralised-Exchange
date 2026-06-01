import jwt from "jsonwebtoken"
import express from "express"
import brycpt from "bcrypt"
import { authMiddleware } from "./auth/middleware.ts"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma"
import { createClient } from "redis"
import { loopback } from "./poller/pending-queue.ts"
import z from "zod"
import { BALANCES, STOCKS } from "../engine/types/types.ts"


const client = await createClient({
  url: process.env.REDIS_URL
})
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
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

  const hashPassword = await brycpt.hash(password, 10)
  const newUser = await prisma.user.create({
    data: {
      username: username,
      password: hashPassword
    }
  })

  const newUserId = newUser.id

  BALANCES[newUserId] = {
    "INR": { available: 0, locked: 0 }
  };

  res.json({ message: "Signed Up!" })
});

app.post("/login", authMiddleware, async (req, res) => {
  const { username, password } = req.body
  const userExists = await prisma.user.findUnique({ where: { username } })

  if (!userExists) {
    res.status(403).json({
      message: "User doesn't exists!"
    });
    return;
  }

  const correctPassword = await brycpt.compare(password, userExists.password)

  if (!correctPassword) {
    res.status(403).json({
      message: "Incorrect password!"
    })
    return;
  }

  const token = jwt.sign({
    userId: userExists.id
  }, "angadsecretcode123")

  res.json({
    token
  })
});

app.post("/order", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { side, type, symbol, price, qty } = req.body;
  const identifier = Math.random()
  await client.lPush("incoming-queue", JSON.stringify({
    type: "create_order",
    payload: { side, type, symbol, price, qty, userId },
    identifier
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: "Order Placed!", data: returnedData.data })
});

app.post("/admin/market", async (req, res) => {
  const { symbol, imageUrl } = req.body;
  const response = await prisma.market.upsert({
    where: { slug: symbol },
    update: { imageUrl },
    create: { slug: symbol, imageUrl },
  });

  const queueLoopbackResponse = await loopback({
    messageType: "create_market",
    marketId: response.id
  });

  if (!queueLoopbackResponse) {
    res.status(403).json({ message: "Loopback failed" });
    return;
  }

  res.json({ message: "Market created!", id: response.id });
});


app.delete("/order/:orderId", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = req.params.orderId
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "cancel_order",
    payload: { userId, orderId },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: "Order Cancalled!", data: returnedData.data })
});

app.get("/orders", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "get_all_orders",
    payload: { userId },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: "All your orders!", data: returnedData.data })
});

app.get("/orders/:orderId", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = req.params.orderId
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "get_order",
    payload: { userId, orderId },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: "Here is your order details!", data: returnedData.data })
});

app.get("/orderbook/:symbol", authMiddleware, async (req, res) => {
  const symbol = req.params.symbol
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "get_depth",
    payload: { symbol },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: `${symbol} details`, data: returnedData.data })
});

app.get("/fills/:symbol", authMiddleware, async (req, res) => {
  const symbol = req.params.symbol
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "get_fills",
    payload: { symbol },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: `${symbol} fills`, data: returnedData.data })
});

app.get("/stocks", (req, res) => {
  res.json({ data: STOCKS });
});

app.get("/balance", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const identifier = Math.random()

  await client.lPush("incoming-queue", JSON.stringify({
    type: "get_user_balance",
    payload: { userId },
    identifier,
    responseQueue: "response-queue-" + QUEUE_ID
  }))

  const returnedData = await pendingQueues(identifier);
  if (!returnedData.ok) {
    res.status(400).json({ message: returnedData.error })
    return;
  }
  res.json({ message: "Here is your balance", data: returnedData.data })
});

app.listen(3000, () => console.log("CEX running on :3000"));
