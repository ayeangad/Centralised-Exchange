import type { OpenOrder, ToEngine, Balance, OrderRecord, OrderStatus, RestingOrder, Fill, DepthResponse } from "../types/types.ts";
import { BALANCES, ORDERS, ORDERBOOK, FILLS } from "../types/types.ts";
import { publishDepth } from '../orders/wspublish.ts'


export function getBalance(userId: string, symbol: string) {
  if (!BALANCES[userId]) BALANCES[userId] = {};
  if (!BALANCES[userId][symbol]) {
    BALANCES[userId][symbol] = { available: 10000, locked: 0 };
  }
  return BALANCES[userId][symbol];
}

export function getOrderbook(symbol: string) {
  if (!ORDERBOOK[symbol]) {
    ORDERBOOK[symbol] = { bids: [], asks: [] }
  }
  return ORDERBOOK[symbol];
}

export function settleTrade(buyerId: string, sellerId: string, qty: number, price: number, symbol: string): void {
  const totalCost = qty * price;
  getBalance(buyerId, "INR").locked -= totalCost
  getBalance(sellerId, "INR").available += totalCost

  getBalance(sellerId, symbol).locked -= qty;
  getBalance(buyerId, symbol).available += qty;
}

export function createOrder(input: Extract<ToEngine, { messageType: "create_order" }>) {
  const { userId, price, qty, side, type, symbol } = input;
  const totalCost = (price || 0) * qty
  if (type === "market") throw new Error("Market orders are not supported yet.")

  if (side === "buy") {
    if (getBalance(userId, "INR").available < totalCost) {
      throw new Error("Low funds!")
    }
    getBalance(userId, "INR").available -= totalCost
    getBalance(userId, "INR").locked += totalCost

  } else if (side === "sell") {
    if (getBalance(userId, symbol).available < qty) {
      throw new Error("Not enough stock!")
    }
    getBalance(userId, symbol).available -= qty
    getBalance(userId, symbol).locked += qty
  }

  const orderId = crypto.randomUUID();
  const order: OrderRecord = {
    userId,
    orderId,
    symbol,
    side,
    type,
    price: price || null,
    fills: [],
    createdAt: Date.now(),
    qty,
    filledQty: 0,
    status: "open"
  }

  const books = getOrderbook(symbol)
  const oppositeSide = side === "buy" ? books.asks : books.bids;
  let remainingQty = qty

  for (let i = 0; i < oppositeSide.length; i++) {
    const existingOrder: RestingOrder = oppositeSide[i]!
    const isMatch = side === "buy" ? (existingOrder.price <= price!) : (existingOrder.price >= price!);

    if (isMatch) {
      const fillAmount = Math.min(remainingQty, existingOrder.qty);

      remainingQty -= fillAmount
      existingOrder.qty -= fillAmount
      existingOrder.filledQty += fillAmount

      const fillId = crypto.randomUUID();
      const fills: Fill = {
        fillId,
        symbol: existingOrder.symbol,
        price: existingOrder.price,
        qty: fillAmount,
        buyOrderId: side === "buy" ? order.orderId : existingOrder.orderId,
        sellOrderId: side === "sell" ? order.orderId : existingOrder.orderId,
        createdAt: Date.now()
      }
      order.fills.push(fills);
      FILLS.push(fills)

      const globalExisting = ORDERS.get(existingOrder.orderId)!;
      globalExisting.filledQty += fillAmount;
      globalExisting.status = existingOrder.qty === 0 ? "filled" : "partial";
      globalExisting.fills.push(fills);

      if (side === "buy") {
        settleTrade(userId, existingOrder.userId, fillAmount, existingOrder.price, symbol)
      } else {
        settleTrade(existingOrder.userId, userId, fillAmount, existingOrder.price, symbol)
      };

      if (existingOrder.qty === 0) {
        oppositeSide.splice(i, 1)
        i--
      }
    }
  }

  order.filledQty = qty - remainingQty;
  order.status = remainingQty === 0 ? "filled" : (remainingQty === qty ? "open" : "partial")
  ORDERS.set(order.orderId, order);

  if (remainingQty > 0) {
    const mySide = side === "buy" ? books.bids : books.asks

    mySide.push({
      orderId: order.orderId,
      userId,
      price: price!,
      side,
      type: "limit",
      symbol,
      createdAt: Date.now(),
      qty: remainingQty,
      filledQty: qty - remainingQty,
      status: order.status as OrderStatus,
      openOrders: {
        userId: userId,
        originalOrderId: orderId,
        qty: qty,
        filledQty: qty - remainingQty
      }
    });
  }

  publishDepth(symbol);

  return {
    message: "Order Processed!",
    orderId: order.orderId,
    status: order.status,
    fills: order.fills,
    averagePrice: price ?? 0,
    filled: qty - remainingQty,
    remaining: remainingQty
  }
}


export function getDepth(symbol: string): DepthResponse {
  const books = ORDERBOOK[symbol]
  if (!books) {
    return {
      symbol: symbol,
      bids: [],
      asks: []
    }
  }

  const aggregate = (orders: RestingOrder[]) => {
    const counts: Record<number, number> = {};
    orders.forEach(order => {
      counts[order.price] = (counts[order.price] || 0) + order.qty;
    })
    return Object.entries(counts).map(([price, qty]) => ({
      price: Number(price),
      qty
    }))
  }

  const bids = aggregate(books.bids).sort((a, b) => b.price - a.price)
  const asks = aggregate(books.asks).sort((a, b) => a.price - b.price)


  return {
    symbol,
    bids,
    asks
  }
}

export function getUserBalance(userId: string): Record<string, Balance> {
  return BALANCES[userId] || {};
}

export function cancelOrder(input: CancelOrder) {
  const { orderId, userId } = input
  const order = ORDERS.get(orderId)
  if (!order) throw new Error("Order not found")
  const orderbook = ORDERBOOK[order.symbol]

  if (order.userId !== userId) throw new Error("Unauthorized")
  if (order.status === "filled") throw new Error("Already filled")
  if (!orderbook) throw new Error("Orderbook not found")

  const side = order.side === "buy" ? orderbook.bids : orderbook.asks
  const index = side.findIndex(o => o.orderId === orderId);
  if (index !== -1) side.splice(index, 1)

  if (order.side === "buy") {
    const remainingQty = order.qty - order.filledQty;
    const refund = remainingQty - order.price!;
    getBalance(userId, "INR").locked -= refund;
    getBalance(userId, "INR").available += refund;
  } else {
    const remainingQty = order.qty - order.filledQty;
    getBalance(userId, order.symbol).locked -= remainingQty;
    getBalance(userId, order.symbol).available -= remainingQty;
  }

  order.status = "cancelled"
  return { message: "Order cancelled" };
}

export function getOrder(orderId: string) {
  const order = ORDERS.get(orderId)
  if (!order) throw new Error("Order not found");
  return order;
}

export function getAllOrders(userId: string) {
  const orders = []
  for (const order of ORDERS.values()) {
    if (order.userId === userId) orders.push(order)
  }
  return orders;
}

export function getFills(symbol: string) {
  return FILLS.filter(f => f.symbol === symbol)
}
