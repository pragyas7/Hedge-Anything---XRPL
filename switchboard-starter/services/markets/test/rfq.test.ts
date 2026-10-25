import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { manualClock } from "../src/clock.js";
import { MAKER_KEY, START_MS, bearer, signExec, testApp } from "./helpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("RFQ firm quotes", () => {
  it("rejects expired quotes and terms-hash mismatches, and accepts a matching hash", async () => {
    const clock = manualClock(START_MS);
    ({ app } = await testApp({ clock, seedLiquidity: false }));
    const created = await app.inject({
      method: "POST",
      url: "/v1/exchange/rfqs",
      headers: bearer({ "idempotency-key": "rfq-create", "content-type": "application/json" }),
      payload: {
        instrumentType: "binary",
        canonicalTermsHash: "terms-v1",
        desiredQuantity: "2",
        expiresAt: "2026-10-24T23:00:00.000Z",
        approvedJurisdiction: "US",
      },
    });
    expect(created.statusCode).toBe(200);
    const rfqId = created.json().rfqId as string;
    const read = await app.inject({ method: "GET", url: `/v1/exchange/rfqs/${rfqId}`, headers: bearer() });
    expect(read.json().canonicalTermsHash).toBe("terms-v1");

    const quoted = await app.inject({
      method: "POST",
      url: `/v1/exchange/rfqs/${rfqId}/quotes`,
      headers: bearer({
        "idempotency-key": "rfq-quote",
        "content-type": "application/json",
        "x-sandbox-maker-key": MAKER_KEY,
        "x-sandbox-maker-id": "maker-rfq",
      }),
      payload: {
        rfqId,
        rfqQuoteId: "firm-1",
        makerId: "maker-rfq",
        premiumUsd: "15",
        maxPayoutUsd: "100",
        firmUntil: "2026-10-24T22:30:00.000Z",
        collateralReserved: true,
      },
    });
    expect(quoted.statusCode).toBe(200);
    expect(quoted.json().collateralReserved).toBe(true);

    const nowSec = Math.floor(clock.now().getTime() / 1000);
    const badHash = await signExec(
      {
        sub: "appr_rfq",
        planHash: "sha256:rfq",
        quoteId: "firm-1",
        instrumentId: rfqId,
        venue: "switchboard",
        side: "BUY",
        maxQuantity: "2",
        maxPriceUsd: "100",
        maxSpendUsd: "100",
        canonicalTermsHash: "terms-other",
      },
      nowSec,
    );
    const mismatch = await app.inject({
      method: "POST",
      url: `/v1/exchange/rfqs/${rfqId}/accept`,
      headers: bearer({ "idempotency-key": "rfq-bad-hash", "content-type": "application/json", "x-execution-authorization": badHash }),
      payload: { rfqQuoteId: "firm-1", approvalId: "appr_rfq", planHash: "sha256:rfq", idempotencyKey: "body-1" },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().code).toBe("TERMS_HASH_MISMATCH");

    const goodHash = await signExec(
      {
        sub: "appr_rfq",
        planHash: "sha256:rfq",
        quoteId: "firm-1",
        instrumentId: rfqId,
        venue: "switchboard",
        side: "BUY",
        maxQuantity: "2",
        maxPriceUsd: "100",
        maxSpendUsd: "100",
        canonicalTermsHash: "terms-v1",
      },
      nowSec,
    );
    const accepted = await app.inject({
      method: "POST",
      url: `/v1/exchange/rfqs/${rfqId}/accept`,
      headers: bearer({ "idempotency-key": "rfq-accept", "content-type": "application/json", "x-execution-authorization": goodHash }),
      payload: { rfqQuoteId: "firm-1", approvalId: "appr_rfq", planHash: "sha256:rfq", idempotencyKey: "body-2" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().rfqQuoteId).toBe("firm-1");

    const second = await app.inject({
      method: "POST",
      url: `/v1/exchange/rfqs/${rfqId}/quotes`,
      headers: bearer({
        "idempotency-key": "rfq-quote-2",
        "content-type": "application/json",
        "x-sandbox-maker-key": MAKER_KEY,
        "x-sandbox-maker-id": "maker-rfq",
      }),
      payload: {
        rfqId,
        rfqQuoteId: "firm-2",
        makerId: "maker-rfq",
        premiumUsd: "12",
        maxPayoutUsd: "50",
        firmUntil: "2026-10-24T22:05:00.000Z",
        collateralReserved: true,
      },
    });
    expect(second.statusCode).toBe(200);
    clock.advance(10 * 60 * 1000);
    const expiredToken = await signExec(
      {
        sub: "appr_rfq",
        planHash: "sha256:rfq",
        quoteId: "firm-2",
        instrumentId: rfqId,
        venue: "switchboard",
        side: "BUY",
        maxQuantity: "2",
        maxPriceUsd: "100",
        maxSpendUsd: "100",
        canonicalTermsHash: "terms-v1",
      },
      Math.floor(clock.now().getTime() / 1000),
    );
    const expired = await app.inject({
      method: "POST",
      url: `/v1/exchange/rfqs/${rfqId}/accept`,
      headers: bearer({ "idempotency-key": "rfq-expired", "content-type": "application/json", "x-execution-authorization": expiredToken }),
      payload: { rfqQuoteId: "firm-2", approvalId: "appr_rfq", planHash: "sha256:rfq", idempotencyKey: "body-3" },
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json().code).toBe("QUOTE_EXPIRED");
    expect(app.store.rfqs.get(rfqId)?.acceptedQuoteId).toBe("firm-1");
  });
});
