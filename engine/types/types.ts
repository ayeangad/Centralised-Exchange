export type Side = "buy" | "sell"
export type OrderType = "market" | "limit"
export type OrderStatus = "open" | "partial" | "filled" | "cancelled"

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "get_fills"
  | "get_all_orders"
  | "cancel_order";

export interface EngineRequest {
  identifier: string;
  responseQueue: string;
  type: EngineCommandType;
  payload: Record<string, unknown>;
}

export interface EngineResponse {
  identifier: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
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
  filledQty: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}
export interface CreateOrder {
  userId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
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
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderBook {
  bids: RestingOrder[];
  asks: RestingOrder[];
}

export interface CancelOrder {
  userId: string;
  orderId: string;
}

export interface DepthResponse {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export const STOCKS = ["BTC", "SOL", "ETH", "USDC"]
export const BALANCES: Record<string, Record<string, Balance>> = {};
export const ORDERBOOK: Record<string, OrderBook> = {};
export const ORDERS = new Map<string, OrderRecord>();
export const FILLS: Fill[] = [];

