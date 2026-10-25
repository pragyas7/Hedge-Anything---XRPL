import type { HedgePlan, MarketOrderRequest, MarketOrderResult, OrderStatus } from "@switchboard/contracts";

export interface PlaceOrderInput {
  body: MarketOrderRequest;
  idempotencyKey: string;
  authorization: string;
  correlationId: string;
}

export type MarketsOrderOutcome =
  | { kind: "result"; result: MarketOrderResult }
  | { kind: "reapproval"; reason: string }
  | { kind: "unreachable" }
  | { kind: "rejected"; message: string };

export interface MarketsClient {
  placeOrder(input: PlaceOrderInput): Promise<MarketsOrderOutcome>;
}

export interface QuoteRevalidation {
  materialPriceChange: boolean;
  quoteExpired: boolean;
  reason?: string;
}

/** Separate from order placement. A price-move flag must not submit an order. */
export interface QuoteRevalidationClient {
  check(input: { plan: HedgePlan; now: Date }): Promise<QuoteRevalidation>;
}

export class DefaultRevalidation implements QuoteRevalidationClient {
  async check(input: { plan: HedgePlan; now: Date }): Promise<QuoteRevalidation> {
    const expires = Date.parse(input.plan.expiresAt);
    return {
      materialPriceChange: false,
      quoteExpired: Number.isFinite(expires) && input.now.getTime() >= expires,
    };
  }
}

const ORDER_STATUSES: readonly OrderStatus[] = [
  "CREATED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "SIMULATED",
];

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function parseMarketOrderResult(value: unknown, fallbackClientOrderId: string): MarketOrderResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isOrderStatus(raw.status)) return undefined;
  if (typeof raw.venueOrderId !== "string" || typeof raw.filledQuantity !== "string" || typeof raw.averageFillPriceUsd !== "string") {
    return undefined;
  }
  const status = raw.status;
  const result: MarketOrderResult = {
    clientOrderId: typeof raw.clientOrderId === "string" ? raw.clientOrderId : fallbackClientOrderId,
    venueOrderId: raw.venueOrderId,
    status,
    filledQuantity: raw.filledQuantity,
    averageFillPriceUsd: raw.averageFillPriceUsd,
    syntheticDemo: status === "SIMULATED" ? true : raw.syntheticDemo === true,
  };
  if (typeof raw.txHash === "string" && raw.txHash.length > 0) result.txHash = raw.txHash;
  return result;
}

function reapprovalReason(status: number, code: string, orderStatus?: string): string | undefined {
  if (orderStatus === "EXPIRED") return "EXPIRED";
  if (status === 409 && /STALE|PRICE|REAPPROVAL/i.test(code)) return code || "REAPPROVAL_REQUIRED";
  return undefined;
}

export class HttpMarketsClient implements MarketsClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      bearer: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async placeOrder(input: PlaceOrderInput): Promise<MarketsOrderOutcome> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${this.options.baseUrl}/v1/markets/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.bearer}`,
          "idempotency-key": input.idempotencyKey,
          "x-execution-authorization": input.authorization,
          "x-correlation-id": input.correlationId,
        },
        body: JSON.stringify(input.body),
      });
      const text = await response.text();
      let parsed: unknown = {};
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          return { kind: "rejected", message: `markets returned non-JSON HTTP ${response.status}` };
        }
      }
      const code = parsed && typeof parsed === "object" && "code" in parsed && typeof (parsed as { code?: unknown }).code === "string"
        ? (parsed as { code: string }).code
        : "";
      const order = parseMarketOrderResult(parsed, input.body.clientOrderId);
      const reason = reapprovalReason(response.status, code, order?.status);
      if (reason) return { kind: "reapproval", reason };
      if (!response.ok) {
        const message = parsed && typeof parsed === "object" && "message" in parsed && typeof (parsed as { message?: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : `markets HTTP ${response.status}`;
        return { kind: "rejected", message };
      }
      if (!order) return { kind: "rejected", message: "markets response did not match MarketOrderResult" };
      return { kind: "result", result: order };
    } catch {
      return { kind: "unreachable" };
    }
  }
}
