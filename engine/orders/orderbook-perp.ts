import { type PositionSide, POSITIONS, ORDERS, type Fill, BALANCES, type Positions, type OpenOrder, type ToEngine, type RestingOrder, type OrderRecord, FILLS, type Side, type Intent } from "../types/types";
import { getBalance, getOrderbook } from "./orderbook-spot";

function settleTrade(makerId: string, side: PositionSide, size: number, marginLocked: number, symbol: string, makerIntent: Intent, price: number, fillAmount: number, takerId: string, takerSide: PositionSide, takerIntent: Intent): void {
  const makerPosition = POSITIONS.get(makerId)
  const totalPrice = fillAmount * price
  let liquidationPrice

  if (side === "long") {
    liquidationPrice = totalPrice - marginLocked
  } else if (side === "short") {
    liquidationPrice = totalPrice + marginLocked
  }

  if (liquidationPrice === undefined) throw new Error("Liquidation Price undefined")

  if (!makerPosition) {
    POSITIONS.set(makerId, {
      userId: makerId,
      symbol: symbol,
      side: side,
      size: fillAmount,
      marginLocked: marginLocked,
      liquidationPrice: liquidationPrice,
      averagePrice: price,
      realizedPnl: 0
    })
  }
}

export function createPerpOrder(input: Extract<ToEngine, { messageType: "create_perporder" }>) {
  const { userId, symbol, side, type, intent, qty, margin, price, leverage } = input
  const totalCost = qty * price
  const reqMargin = totalCost / leverage
  const positionSize = margin * leverage
  const availableEquity = getAvailableEquity({ messageType: "available_equity", userId: userId })
  if (reqMargin > availableEquity) {
    throw new Error("Not enough margin!")
  }

  if (side === "buy" || side === "sell") {
    getBalance(userId, "INR").available -= reqMargin
    getBalance(userId, "INR").locked += reqMargin
  }

  const orderId = crypto.randomUUID()
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
    status: "open",
    intent
  }

  const books = getOrderbook(symbol)
  const oppositeSide = side === "buy" ? books.asks : books.bids
  let remainingQty = qty

  for (let i = 0; i < oppositeSide.length; i++) {
    const existingOrder: RestingOrder = oppositeSide[i]!
    const isMatch = side === "buy" ? (existingOrder.price <= price) : (existingOrder.price >= price)

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
        createdAt: Date.now(),
        takerIntent: intent,
        makerIntent: existingOrder.intent
      }
      order.fills.push(fills)
      FILLS.push(fills)

      const globalExisting = ORDERS.get(existingOrder.orderId)
      if (!globalExisting) throw new Error("Doesnt exists")
      globalExisting.filledQty += fillAmount;
      globalExisting.status = existingOrder.qty === 0 ? "filled" : "partial"
      globalExisting.fills.push(fills)

      if (!existingOrder.intent || !intent) {
        throw new Error("Perp match without an intent!")
      }

      settleTrade()

    }
  }

}

export function getAvailableEquity(input: Extract<ToEngine, { messageType: "available_equity" }>): number {
  const { userId } = input
  const availableEquity: number = 1200
  return availableEquity
}
