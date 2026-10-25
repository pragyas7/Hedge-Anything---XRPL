import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ExchangeOrderbook, MarketOrderResult } from "@switchboard/contracts";
import { Decimal } from "decimal.js";
import { OUTAGE_ID } from "../src/instruments.js";
import { BEARER, MAKER_KEY, bearer, testApp } from "./helpers.js";

let app: FastifyInstance | undefined;
const goodTil = "2027-01-01T00:00:00.000Z";

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function headers(makerId: string, key: string) {
  return bearer({
    "idempotency-key": key,
    "content-type": "application/json",
    "x-sandbox-maker-key": MAKER_KEY,
    "x-sandbox-maker-id": makerId,
  });
}

function order(makerFields: { side: "BUY" | "SELL"; priceUsd: string; quantity: string; nonce: string; clientOrderId: string }) {
  return { instrumentId: OUTAGE_ID, goodTil, ...makerFields };
}

async function place(instance: FastifyInstance, makerId: string, key: string, body: ReturnType<typeof order>) {
  return instance.inject({ method: "POST", url: "/v1/exchange/orders", headers: headers(makerId, key), payload: body });
}

describe("sandbox CLOB", () => {
  it("matches price-time, partial fills, cancels, blocks self-trades, and rejects thin collateral", async () => {
    ({ app } = await testApp({ seedLiquidity: false }));
    const a = await place(app, "maker-a", "a1", order({ side: "SELL", priceUsd: "12", quantity: "5", nonce: "a1", clientOrderId: "a-ask" }));
    const b = await place(app, "maker-b", "b1", order({ side: "SELL", priceUsd: "10", quantity: "5", nonce: "b1", clientOrderId: "b-ask" }));
    const c = await place(app, "maker-c", "c1", order({ side: "SELL", priceUsd: "10", quantity: "4", nonce: "c1", clientOrderId: "c-ask" }));
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(c.statusCode).toBe(200);

    const buy = await place(app, "maker-d", "d1", order({ side: "BUY", priceUsd: "12", quantity: "7", nonce: "d1", clientOrderId: "d-bid" }));
    expect(buy.statusCode).toBe(200);
    const bought = buy.json() as MarketOrderResult;
    expect(bought.status).toBe("FILLED");
    expect(bought.syntheticDemo).toBe(true);
    expect(bought.filledQuantity).toBe("7");
    expect(bought.averageFillPriceUsd).toBe("10");

    const book = await app.inject({ method: "GET", url: `/v1/exchange/orderbook/${OUTAGE_ID}`, headers: bearer() });
    expect(book.statusCode).toBe(200);
    const depth = book.json() as ExchangeOrderbook;
    expect(depth.mode).toBe("sandbox");
    expect(depth.asks.map((level) => level.priceUsd)).toEqual(["10", "12"]);
    expect(depth.asks[0]?.quantity).toBe("2");
    expect(depth.bids).toEqual([]);

    const selfAsk = await place(app, "maker-e", "e1", order({ side: "SELL", priceUsd: "9", quantity: "3", nonce: "e1", clientOrderId: "e-ask" }));
    const selfBid = await place(app, "maker-e", "e2", order({ side: "BUY", priceUsd: "9", quantity: "3", nonce: "e2", clientOrderId: "e-bid" }));
    expect(selfAsk.json()).toMatchObject({ status: "ACCEPTED", filledQuantity: "0" });
    expect(selfBid.json()).toMatchObject({ status: "ACCEPTED", filledQuantity: "0" });
    const other = await place(app, "maker-f", "f1", order({ side: "BUY", priceUsd: "9", quantity: "3", nonce: "f1", clientOrderId: "f-bid" }));
    expect(other.json()).toMatchObject({ status: "FILLED", filledQuantity: "3", averageFillPriceUsd: "9", syntheticDemo: true });

    const cancel = await app.inject({
      method: "POST",
      url: "/v1/exchange/orders/cancel",
      headers: headers("maker-c", "cancel-1"),
      payload: { clientOrderId: "c-ask" },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ status: "CANCELLED", filledQuantity: "2", syntheticDemo: true });
    const cancelAgain = await app.inject({
      method: "POST",
      url: "/v1/exchange/orders/cancel",
      headers: headers("maker-c", "cancel-2"),
      payload: { clientOrderId: "c-ask" },
    });
    expect(cancelAgain.json()).toEqual(cancel.json());

    const before = app.store.book.snapshot();
    const tooBig = await place(app, "maker-g", "g1", order({ side: "SELL", priceUsd: "10", quantity: "1001", nonce: "g1", clientOrderId: "g-ask" }));
    expect(tooBig.statusCode).toBe(409);
    expect(tooBig.json().code).toBe("INSUFFICIENT_COLLATERAL");
    expect(app.store.book.snapshot()).toEqual(before);

    const duplicate = await place(app, "maker-a", "a2", order({ side: "SELL", priceUsd: "12", quantity: "5", nonce: "a1", clientOrderId: "a-ask" }));
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual(a.json());
    const changed = await place(app, "maker-a", "a3", order({ side: "SELL", priceUsd: "13", quantity: "5", nonce: "a1", clientOrderId: "a-ask" }));
    expect(changed.statusCode).toBe(409);
    expect(changed.json().code).toBe("CLIENT_ORDER_CONFLICT");

    const nonce = await place(app, "maker-a", "a4", order({ side: "SELL", priceUsd: "13", quantity: "1", nonce: "a1", clientOrderId: "a-other" }));
    expect(nonce.statusCode).toBe(409);
    expect(nonce.json().code).toBe("NONCE_REPLAY");

    const total = app.store.book.snapshot().accounts.reduce((sum, account) => sum.add(account.free).add(account.locked), new Decimal(0));
    const endowed = app.store.book.snapshot().accounts.length;
    expect(total.toFixed()).toBe(String(endowed * 1_000_000));

    const missingKey = await app.inject({
      method: "POST",
      url: "/v1/exchange/orders",
      headers: bearer({ "idempotency-key": "no-maker", "content-type": "application/json" }),
      payload: order({ side: "BUY", priceUsd: "10", quantity: "1", nonce: "z", clientOrderId: "z" }),
    });
    expect(missingKey.statusCode).toBe(401);
    expect(missingKey.json().code).toBe("INVALID_MAKER_KEY");

    const instruments = await app.inject({ method: "GET", url: "/v1/exchange/instruments", headers: { authorization: `Bearer ${BEARER}` } });
    expect(instruments.statusCode).toBe(200);
    expect(instruments.json().instruments).toHaveLength(3);
    expect(instruments.json().mode).toBe("sandbox");
    expect(instruments.json().instruments.map((instrument: { name: string }) => instrument.name).join(" ")).toContain("SERVICE_OUTAGE_BINARY");
  });
});
