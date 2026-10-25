import type { FeeBreakdown } from "@switchboard/contracts";
import { D, money } from "./money.js";
import type { Decimal } from "decimal.js";

export interface BookLevel {
  priceUsd: string;
  quantity: string;
}

/** Versioned sandbox schedule. Not a Kalshi or Polymarket US fee table. */
export interface FeeSchedule {
  version: string;
  tradingFeeRate: string;
  networkFeeUsd: string;
  conversionFeeRate: string;
  /** Applied only to size the book cannot fill. The walk itself is the filled-size price. */
  unfilledSlippageRate: string;
}

export const SWITCHBOARD_SANDBOX_FEES: FeeSchedule = {
  version: "switchboard-sandbox-fee-v1",
  tradingFeeRate: "0.01",
  networkFeeUsd: "1",
  conversionFeeRate: "0",
  unfilledSlippageRate: "0.02",
};

/** Zeros mean the venue fee table was not applied, not that the venue is free. */
export const UNVERIFIED_VENUE_FEES: FeeSchedule = {
  version: "unverified-fee-not-applied-v1",
  tradingFeeRate: "0",
  networkFeeUsd: "0",
  conversionFeeRate: "0",
  unfilledSlippageRate: "0.02",
};

export interface PriceAtSize {
  filledQuantity: string;
  availableQuantity: string;
  notionalUsd: string;
  fees: FeeBreakdown;
  estimatedAllInBuyCostUsd: string;
  /** True only when ask depth covers the requested quantity. */
  depthCoversQuantity: boolean;
  bestAskUsd: string;
  lastWalkedPriceUsd: string;
}

export function priceAtSize(asks: BookLevel[], requestedQuantity: string, fees: FeeSchedule): PriceAtSize {
  const requested = D(requestedQuantity);
  const levels = asks
    .map((level) => ({ price: D(level.priceUsd), quantity: D(level.quantity) }))
    .filter((level) => level.price.gt(0) && level.quantity.gt(0))
    .sort((a, b) => a.price.cmp(b.price));

  let available = D(0);
  for (const level of levels) available = available.add(level.quantity);

  let remaining = requested;
  let notional = D(0);
  let filled = D(0);
  let lastPrice = levels.length > 0 ? levels[0]!.price : D(0);
  for (const level of levels) {
    if (remaining.lte(0)) break;
    const take = DecimalMin(remaining, level.quantity);
    notional = notional.add(take.mul(level.price));
    filled = filled.add(take);
    remaining = remaining.sub(take);
    lastPrice = level.price;
  }

  const unfilled = requested.sub(filled);
  const trading = notional.mul(D(fees.tradingFeeRate));
  const network = D(fees.networkFeeUsd);
  const conversion = notional.mul(D(fees.conversionFeeRate));
  const slippage = unfilled.gt(0) ? unfilled.mul(lastPrice).mul(D(fees.unfilledSlippageRate)) : D(0);
  const allIn = notional.add(trading).add(network).add(conversion).add(slippage);
  const feeBreakdown: FeeBreakdown = {
    tradingFeeUsd: money(trading),
    networkFeeUsd: money(network),
    conversionFeeUsd: money(conversion),
    modeledSlippageUsd: money(slippage),
    otherFeeUsd: "0",
  };

  return {
    filledQuantity: money(filled),
    availableQuantity: money(available),
    notionalUsd: money(notional),
    fees: feeBreakdown,
    estimatedAllInBuyCostUsd: money(allIn),
    depthCoversQuantity: requested.gt(0) && unfilled.lte(0),
    bestAskUsd: levels.length > 0 ? money(levels[0]!.price) : "0",
    lastWalkedPriceUsd: levels.length > 0 ? money(lastPrice) : "0",
  };
}

function DecimalMin(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}

export function bestBid(bids: BookLevel[]): string {
  let best: Decimal | undefined;
  for (const level of bids) {
    const price = D(level.priceUsd);
    if (price.lte(0) || D(level.quantity).lte(0)) continue;
    if (!best || price.gt(best)) best = price;
  }
  return best ? money(best) : "0";
}
