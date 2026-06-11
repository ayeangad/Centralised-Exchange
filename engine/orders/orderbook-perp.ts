import { type OrderStatus, INSURANCE_FUND, type PositionSide, POSITIONS, ORDERS, type Fill, BALANCES, type Positions, type OpenOrder, type ToEngine, type RestingOrder, type OrderRecord, FILLS, type Side, type Intent, STOCKS, type Balance } from "../types/types";
import { getBalance, getOrderbook } from "./orderbook-spot";
import { publishDepth } from "./wspublish";



function payFundingRate(symbol: string, spotPrice: number): void {
  const bestBid = getOrderbook(symbol).bids.sort((a, b) => b.price - a.price)
  const bestAsk = getOrderbook(symbol).asks.sort((a, b) => a.price - b.price)

  if (bestAsk[0] === undefined || bestBid[0] === undefined) {
    throw new Error("Couldnt find the best bid or best ask ")
  }

  const perpPrice = (bestBid[0].price + bestAsk[0].price) / 2
  const fundingRate = (perpPrice - spotPrice) / spotPrice

  for (const [userId, position] of POSITIONS) {
    if (position.symbol === symbol) {
      const fundingPayment = position.size * position.averagePrice * fundingRate
      if (fundingRate > 0) {
        if (position.side === "long") {
          if (getBalance(userId, "INR").available < fundingPayment) {
            liquidatePosition(symbol, perpPrice)
          } else {
            getBalance(userId, "INR").available -= fundingPayment
          }
        } else if (position.side === "short") {
          getBalance(userId, "INR").available += fundingPayment
        }
      } else if (fundingRate < 0) {
        if (position.side === "short") {
          if (getBalance(userId, "INR").available < Math.abs(fundingPayment)) {
            liquidatePosition(symbol, perpPrice)
          } else {
            getBalance(userId, "INR").available -= Math.abs(fundingPayment)
          }
        } else if (position.side === "long") {
          getBalance(userId, "INR").available += Math.abs(fundingPayment)
        }
      }
    }
  }
}


// get spotPrice from binance
setInterval(() => {
  for (const symbol of STOCKS) {
    payFundingRate(symbol, 10000) // spotPrice
  }
}, 8 * 60 * 60 * 1000)


function getPositionSide(side: Side): PositionSide {
  if (side === "buy") {
    return "long"
  } else if (side === "sell") {
    return "short"
  } else {
    throw new Error("Side Undefined")
  }
}


function updatePositionState(userId: string, symbol: string, tradeSide: Side, intent: Intent, matchPrice: number, matchQty: number, marginLockedinTrade: number): void {
  const currentPosition = POSITIONS.get(userId)
  let liquidationPrice
  if (tradeSide === "buy") {
    liquidationPrice = matchPrice - marginLockedinTrade
  } else if (tradeSide === "sell") {
    liquidationPrice = matchPrice + marginLockedinTrade
  } else {
    throw new Error("Liquidation Error!")
  }

  if (intent === "OPEN") {
    if (!currentPosition || currentPosition === undefined) {
      POSITIONS.set(userId, {
        userId: userId,
        symbol: symbol,
        side: getPositionSide(tradeSide),
        size: matchQty,
        marginLocked: marginLockedinTrade,
        liquidationPrice: liquidationPrice,
        averagePrice: matchPrice,
        realizedPnl: 0
      })
    } else if (currentPosition.side === getPositionSide(tradeSide)) {
      const newQty = matchQty + currentPosition.size
      const newMargin = currentPosition.marginLocked + marginLockedinTrade
      const existingPos = currentPosition.size * currentPosition.averagePrice
      const newFill = matchPrice * matchQty
      const totalNotional = existingPos + newFill
      const newAveragePrice = totalNotional / newQty

      let newLiquidationPrice
      if (getPositionSide(tradeSide) === "long") {
        newLiquidationPrice = totalNotional - newMargin
      } else if (getPositionSide(tradeSide) === "short") {
        newLiquidationPrice = totalNotional + newMargin
      } else {
        throw new Error("Position Side Liquidation Price Undefined")
      }

      POSITIONS.set(userId, {
        userId: userId,
        symbol: symbol,
        side: getPositionSide(tradeSide),
        size: newQty,
        marginLocked: newMargin,
        liquidationPrice: newLiquidationPrice,
        averagePrice: newAveragePrice,
        realizedPnl: currentPosition.realizedPnl
      })
    } else if (currentPosition.side != getPositionSide(tradeSide)) {
      throw new Error("Close your previous position first!")
    }
  } else if (intent === "CLOSE") {
    if (!currentPosition) {
      throw new Error("No Current Position to close!")
    } else {
      let realizedPnl;
      if (currentPosition.side === "long") {
        realizedPnl = (matchPrice - currentPosition.averagePrice) * matchQty
      } else if (currentPosition.side === "short") {
        realizedPnl = (currentPosition.averagePrice - matchPrice) * matchQty
      } else {
        throw new Error("RealizedPnl undefined")
      }

      const newQty = currentPosition.size - matchQty
      const newMargin = currentPosition.marginLocked - marginLockedinTrade
      const totalNotional = newQty * currentPosition.averagePrice

      let newLiquidationPrice
      if (getPositionSide(tradeSide) === "long") {
        newLiquidationPrice = totalNotional - newMargin
      } else if (getPositionSide(tradeSide) === "short") {
        newLiquidationPrice = totalNotional + newMargin
      } else {
        throw new Error("Position Side Liquidation Price Undefined")
      }

      getBalance(userId, "INR").locked -= marginLockedinTrade
      currentPosition.realizedPnl += realizedPnl

      if (currentPosition.size === 0) {
        POSITIONS.delete(userId)
      } else {
        POSITIONS.set(userId, {
          userId: userId,
          symbol: symbol,
          side: getPositionSide(tradeSide),
          size: newQty,
          marginLocked: newMargin,
          liquidationPrice: newLiquidationPrice,
          averagePrice: currentPosition.averagePrice,
          realizedPnl: currentPosition.realizedPnl
        })
      }

    }
  }
}

function liquidatePosition(symbol: string, currentPrice: number): void {
  for (const [userId, position] of POSITIONS) {
    if (position.symbol === symbol) {
      if (position.side === "long") {
        if (currentPrice >= position.liquidationPrice) {
          getBalance(userId, "INR").locked -= position.marginLocked
          INSURANCE_FUND.balance += position.marginLocked
          POSITIONS.delete(userId)
        }
      } else if (position.side === "short") {
        if (currentPrice <= position.liquidationPrice) {
          getBalance(userId, "INR").locked -= position.marginLocked
          INSURANCE_FUND.balance += position.marginLocked
          POSITIONS.delete(userId)
        }
      }
    }
  }
}

setInterval(() => {
  for (const symbol of STOCKS) {
    liquidatePosition(symbol, 50000) // calc current price with api
  }
}, 10000)

export function createPerpOrder(input: Extract<ToEngine, { messageType: "create_perporder" }>) {
  const { userId, symbol, side, type, intent, qty, margin, price, leverage } = input
  const totalCost = qty * price
  const reqMargin = totalCost / leverage
  const availableEquity = getAvailableEquity({ messageType: "available_equity", userId: userId })

  if (intent === "CLOSE") {
    const currentPosition = POSITIONS.get(userId)
    const targetPositionSide = getPositionSide(side)

    if (!currentPosition) {
      throw new Error("Position Doesnt Exist!")
    }
    if (currentPosition.side === targetPositionSide) {
      throw new Error("Cant close a position by adding a new position")
    }
    if (qty > currentPosition.size) {
      throw new Error("Close quantity exceeds current position size")
    }
  }

  if (reqMargin > availableEquity) {
    throw new Error("Not enough margin!")
  }
  if (margin < reqMargin) {
    throw new Error("Not enough required margin")
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
    leverage,
    qty,
    filledQty: 0,
    status: "open",
    intent
  }
  ORDERS.set(orderId, order)

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
        leverage: existingOrder.leverage,
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

      const makerMarginLocked = (fillAmount * existingOrder.price) / existingOrder?.leverage
      updatePositionState(String(existingOrder.userId), symbol, existingOrder.side, existingOrder.intent, existingOrder.price, fillAmount, makerMarginLocked)

      const takerMarginLocked = (fillAmount * price) / leverage
      updatePositionState(String(userId), symbol, side, intent, price, fillAmount, takerMarginLocked)
    }
  }

  order.filledQty = qty - remainingQty
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
      intent: intent,
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


export function getAvailableEquity(input: Extract<ToEngine, { messageType: "available_equity" }>): number {
  const { userId } = input
  const userBal = getBalance(userId, "INR")
  return userBal.available
}

export function onRamp(input: Extract<ToEngine, { messageType: "onramp" }>): number {
  const { userId, amount } = input
  const userBal = getBalance(userId, "INR")
  userBal.available += amount
  return userBal.available
}

export function getPerpOrders(input: Extract<ToEngine, { messageType: "get_perp_orders" }>) {
  const { userId } = input
  const orders = []
  for (const order of ORDERS.values()) {
    if (order.intent) {
      if (order.userId === userId) orders.push(order)
    }
  }
  return orders
}

export function getPerpPositions(input: Extract<ToEngine, { messageType: "get_perp_positions" }>) {
  const { userId } = input
  console.log(userId)
  const userPosition = POSITIONS.get(userId)
  if (!userPosition) {
    throw new Error("You have no position")
  }
  return userPosition
}

export function cancelPerpOrder(input: Extract<ToEngine, { messageType: "cancel_perp_order" }>) {
  const { userId, orderId } = input
  const userOrder = ORDERS.get(orderId)

  if (!userOrder) {
    throw new Error("Order doesnt exist")
  }
  if (userOrder.userId != userId) {
    throw new Error("You are not the owner of this order")
  }
  if (userOrder.qty === userOrder.filledQty) {
    throw new Error("Order is filled")
  }
  const orderbook = getOrderbook(userOrder.symbol)
  const side = userOrder.side === "buy" ? orderbook.bids : orderbook.asks
  const index = side.findIndex(i => i.orderId === orderId)
  if (index != -1) side.splice(index, 1)

  if (!userOrder.price || userOrder.leverage === undefined) throw new Error("Price cant be null or leverage is undefined")

  const remainingQty = userOrder.qty - userOrder.filledQty
  const totalCost = remainingQty * userOrder.price
  const marginLeft = totalCost / userOrder.leverage

  getBalance(userId, "INR").locked -= marginLeft
  getBalance(userId, "INR").available += marginLeft

  userOrder.status = "cancelled"

  return ("Cancelled")
}
