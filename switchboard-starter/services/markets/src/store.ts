import type { MarketOrderResult, MarketQuote } from "@switchboard/contracts";
import { Decimal } from "decimal.js";
import { EXECUTION_FLOW, LIQUIDITY_MAKER, OrderBook, type PlaceOrderInput } from "./book.js";
import { D } from "./money.js";
import { instrumentById, SANDBOX_LIQUIDITY, STANDARD_INSTRUMENTS } from "./instruments.js";
import type { IdempotentRecord } from "./idempotency.js";

export interface StoredQuote {
  quote: MarketQuote;
  /** Search-time depth was enough and the venue is the sandbox book. */
  executable: boolean;
  mode: "book" | "snapshot";
  snapshotRemaining: Decimal;
}

export interface StoredMarketOrder {
  fingerprint: string;
  result: MarketOrderResult;
}

export interface StoredFirmQuote {
  rfqId: string;
  rfqQuoteId: string;
  makerId: string;
  premiumUsd: string;
  maxPayoutUsd: string;
  firmUntil: string;
  collateralReserved: boolean;
  canonicalTermsHash: string;
  lockedAmount: Decimal;
  status: "FIRM" | "ACCEPTED" | "EXPIRED";
}

export interface StoredRfq {
  rfqId: string;
  instrumentType: "binary" | "capped_call" | "capacity_option";
  canonicalTermsHash: string;
  desiredQuantity: string;
  expiresAt: string;
  approvedJurisdiction: string;
  quotes: StoredFirmQuote[];
  acceptedQuoteId?: string;
}

export class MemoryStore {
  readonly quotes = new Map<string, StoredQuote>();
  readonly idempotency = new Map<string, IdempotentRecord>();
  readonly usedJti = new Set<string>();
  readonly marketOrders = new Map<string, StoredMarketOrder>();
  readonly rfqs = new Map<string, StoredRfq>();
  readonly book: OrderBook;
  private sequence = 0;

  constructor(endowmentUsd: string) {
    const endowment = D(endowmentUsd);
    const large = D("100000000");
    this.book = new OrderBook(
      (instrumentId) => {
        const instrument = instrumentById(instrumentId);
        return instrument ? D(instrument.maximumPayoutUsd) : undefined;
      },
      (makerId) => (makerId === LIQUIDITY_MAKER || makerId === EXECUTION_FLOW ? large : endowment),
    );
  }

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }

  seedLiquidity(nowMs: number): void {
    const goodTil = new Date(nowMs + 365 * 24 * 60 * 60 * 1000).toISOString();
    let nonce = 0;
    for (const instrument of STANDARD_INSTRUMENTS) {
      const ladder = SANDBOX_LIQUIDITY[instrument.instrumentId];
      if (!ladder) continue;
      for (const side of ["BUY", "SELL"] as const) {
        for (const level of side === "BUY" ? ladder.bids : ladder.asks) {
          nonce += 1;
          const input: PlaceOrderInput = {
            makerId: LIQUIDITY_MAKER,
            instrumentId: instrument.instrumentId,
            side,
            priceUsd: level.priceUsd,
            quantity: level.quantity,
            nonce: `seed_${nonce}`,
            goodTil,
            clientOrderId: `seed_${instrument.instrumentId}_${side}_${level.priceUsd}`,
            nowMs,
            timeInForce: "GTC",
          };
          this.book.place(input);
        }
      }
    }
  }
}
