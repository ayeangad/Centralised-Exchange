export type Side = "buy" | "sell"
export type OrderType = "market" | "limit"
export type Intent = "OPEN" | "CLOSE"
export type PositionSide = "long" | "short"
export type OrderStatus = "open" | "partial" | "filled" | "cancelled"

export type ToEngine =
  | { messageType: "create_order"; userId: string; symbol: string; side: Side; type: OrderType; price: number | null; qty: number; }
  | { messageType: "get_depth"; symbol: string; }
  | { messageType: "get_user_balance"; userId: string; }
  | { messageType: "get_order"; userId: string; orderId: string; }
  | { messageType: "get_fills"; symbol: string; }
  | { messageType: "get_all_orders"; userId: string; }
  | { messageType: "cancel_order"; userId: string, orderId: string }
  | { messageType: "create_market"; marketId: number }
  | { messageType: "onramp"; userId: string, amount: string; }
  | { messageType: "available_equity"; userId: string; }
  | { messageType: "create_perporder"; userId: string; symbol: string; side: Side; type: OrderType; intent: Intent; qty: number; margin: number; price: number; leverage: number; }

export type EngineRequest = ToEngine & {
  loopbackId: string;
}

export interface EngineResponse {
  loopbackId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface OpenOrder {
  userId: string,
  originalOrderId: string,
  qty: number,
  filledQty: number
}

export interface RedisStreamResponse {
  name: string;
  messages: {
    id: string;
    message: {
      loopbackId: string,
      [key: string]: any;
    }
  }[]
}

export interface PerpOrder {
  orderId: string;
  symbol: string;
  qty: string;
  margin: number;
  type: OrderType;
  price: number;
  status: OrderStatus;
}

export interface Positions {
  userId: string;
  symbol: string;
  side: PositionSide;
  size: number;
  marginLocked: number;
  liquidationPrice: number;
  averagePrice: number;
  realizedPnl: number;
}

export interface Collateral {
  available: number,
  locked: number
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  leverage: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
  openOrders: OpenOrder;
  intent?: Intent;
}

export interface Balance {
  available: number,
  locked: number
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  leverage: number;
  filledQty: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
  intent?: Intent
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  leverage: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
  makerIntent?: Intent;
  takerIntent?: Intent;
}

export interface OrderBook {
  bids: RestingOrder[];
  asks: RestingOrder[];
}

export interface DepthResponse {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export const STOCKS = ["BTC", "SOL", "ETH", "USDC"]
export const BALANCES = new Map<string, Record<string, Balance>>()
export const ORDERBOOK: Record<string, OrderBook> = {};
export const ORDERS = new Map<string, OrderRecord>();
export const POSITIONS = new Map<string, Positions>();
export const FILLS: Fill[] = [];

