import { describe, expect, it } from "vitest";
import { asksFromKalshiNoBids } from "../src/kalshi.js";
import { SWITCHBOARD_SANDBOX_FEES, priceAtSize } from "../src/pricing.js";

const asks = [
  { priceUsd: "18", quantity: "25" },
  { priceUsd: "21", quantity: "50" },
  { priceUsd: "19", quantity: "25" },
];

describe("price at size", () => {
  it("walks depth and adds trading, network, conversion, and unfilled slippage", () => {
    const full = priceAtSize(asks, "10", SWITCHBOARD_SANDBOX_FEES);
    expect(full.depthCoversQuantity).toBe(true);
    expect(full.availableQuantity).toBe("100");
    expect(full.notionalUsd).toBe("180");
    expect(full.fees.tradingFeeUsd).toBe("1.8");
    expect(full.fees.networkFeeUsd).toBe("1");
    expect(full.fees.conversionFeeUsd).toBe("0");
    expect(full.fees.modeledSlippageUsd).toBe("0");
    expect(full.estimatedAllInBuyCostUsd).toBe("182.8");

    const partial = priceAtSize(asks, "1000", SWITCHBOARD_SANDBOX_FEES);
    expect(partial.depthCoversQuantity).toBe(false);
    expect(partial.availableQuantity).toBe("100");
    expect(partial.notionalUsd).toBe("1975");
    expect(partial.fees.tradingFeeUsd).toBe("19.75");
    expect(partial.fees.modeledSlippageUsd).toBe("378");
    expect(partial.estimatedAllInBuyCostUsd).toBe("2373.75");
  });

  it("turns Kalshi NO bids into YES asks without inventing size", () => {
    expect(asksFromKalshiNoBids([["0.9900", "206.00"], ["0.9800", "10"]])).toEqual([
      { priceUsd: "0.01", quantity: "206" },
      { priceUsd: "0.02", quantity: "10" },
    ]);
  });
});
