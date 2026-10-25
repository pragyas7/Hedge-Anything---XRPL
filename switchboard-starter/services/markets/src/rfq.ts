import type { RfqQuote, RfqRequest, SettlementType } from "@switchboard/contracts";
import type { Clock } from "./clock.js";
import { ApiException } from "./errors.js";
import type { ExecutionClaims } from "./executionAuth.js";
import { D, money } from "./money.js";
import type { MemoryStore, StoredFirmQuote, StoredRfq } from "./store.js";
import { assertExact, assertIso, assertMoney, assertString } from "./validate.js";

const TYPES = new Set<SettlementType>(["binary", "capped_call", "capacity_option"]);

export function parseRfqCreate(body: unknown): RfqRequest {
  const record = assertExact(body, ["instrumentType", "canonicalTermsHash", "desiredQuantity", "expiresAt", "approvedJurisdiction"], ["rfqId"]);
  const instrumentType = assertString(record, "instrumentType");
  if (!TYPES.has(instrumentType as SettlementType)) throw new ApiException(400, "BAD_REQUEST", "instrumentType is invalid");
  const desiredQuantity = assertMoney(record, "desiredQuantity");
  if (D(desiredQuantity).lte(0)) throw new ApiException(400, "BAD_REQUEST", "desiredQuantity must be positive");
  return {
    rfqId: record.rfqId === undefined ? undefined : assertString(record, "rfqId"),
    instrumentType: instrumentType as SettlementType,
    canonicalTermsHash: assertString(record, "canonicalTermsHash"),
    desiredQuantity,
    expiresAt: assertIso(assertString(record, "expiresAt"), "expiresAt"),
    approvedJurisdiction: assertString(record, "approvedJurisdiction"),
  };
}

export function createRfq(store: MemoryStore, request: RfqRequest, nowMs: number): RfqRequest {
  if (Date.parse(request.expiresAt) <= nowMs) throw new ApiException(409, "RFQ_EXPIRED", "RFQ expiry is already past");
  const rfqId = request.rfqId ?? store.nextId("rfq");
  if (store.rfqs.has(rfqId)) throw new ApiException(409, "RFQ_EXISTS", "RFQ id already exists");
  const stored: StoredRfq = {
    rfqId,
    instrumentType: request.instrumentType,
    canonicalTermsHash: request.canonicalTermsHash,
    desiredQuantity: request.desiredQuantity,
    expiresAt: request.expiresAt,
    approvedJurisdiction: request.approvedJurisdiction,
    quotes: [],
  };
  store.rfqs.set(rfqId, stored);
  return toRequest(stored);
}

export function getRfq(store: MemoryStore, rfqId: string): RfqRequest {
  const rfq = store.rfqs.get(rfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  return toRequest(rfq);
}

export function parseFirmQuote(body: unknown): RfqQuote {
  const record = assertExact(body, ["rfqId", "rfqQuoteId", "makerId", "premiumUsd", "maxPayoutUsd", "firmUntil", "collateralReserved"]);
  const premiumUsd = assertMoney(record, "premiumUsd");
  const maxPayoutUsd = assertMoney(record, "maxPayoutUsd");
  if (D(premiumUsd).lte(0) || D(maxPayoutUsd).lte(0)) throw new ApiException(400, "BAD_REQUEST", "premium and max payout must be positive");
  return {
    rfqId: assertString(record, "rfqId"),
    rfqQuoteId: assertString(record, "rfqQuoteId"),
    makerId: assertString(record, "makerId"),
    premiumUsd,
    maxPayoutUsd,
    firmUntil: assertIso(assertString(record, "firmUntil"), "firmUntil"),
    collateralReserved: Boolean(record.collateralReserved),
  };
}

export function publishFirmQuote(store: MemoryStore, pathRfqId: string, quote: RfqQuote, authenticatedMakerId: string, nowMs: number): RfqQuote {
  if (quote.rfqId !== pathRfqId) throw new ApiException(400, "BAD_REQUEST", "rfqId does not match the path");
  if (quote.makerId !== authenticatedMakerId) throw new ApiException(403, "MAKER_MISMATCH", "makerId does not match X-Sandbox-Maker-Id");
  const rfq = store.rfqs.get(pathRfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  if (Date.parse(rfq.expiresAt) <= nowMs) throw new ApiException(409, "RFQ_EXPIRED", "RFQ has expired");
  const firmUntilMs = Date.parse(quote.firmUntil);
  if (firmUntilMs <= nowMs) throw new ApiException(409, "QUOTE_EXPIRED", "Firm quote expiry is already past");
  if (firmUntilMs > Date.parse(rfq.expiresAt)) throw new ApiException(400, "BAD_REQUEST", "firmUntil cannot be after the RFQ expiry");
  if (rfq.quotes.some((existing) => existing.rfqQuoteId === quote.rfqQuoteId)) {
    throw new ApiException(409, "QUOTE_EXISTS", "rfqQuoteId already exists");
  }
  const lockAmount = D(quote.maxPayoutUsd);
  store.book.lockFunds(authenticatedMakerId, lockAmount);
  const stored: StoredFirmQuote = {
    rfqId: rfq.rfqId,
    rfqQuoteId: quote.rfqQuoteId,
    makerId: authenticatedMakerId,
    premiumUsd: money(D(quote.premiumUsd)),
    maxPayoutUsd: money(lockAmount),
    firmUntil: quote.firmUntil,
    collateralReserved: true,
    canonicalTermsHash: rfq.canonicalTermsHash,
    lockedAmount: lockAmount,
    status: "FIRM",
  };
  rfq.quotes.push(stored);
  return toQuote(stored);
}

export interface RfqAcceptBody {
  rfqQuoteId: string;
  approvalId: string;
  planHash: string;
  idempotencyKey: string;
}

export function parseAccept(body: unknown): RfqAcceptBody {
  const record = assertExact(body, ["rfqQuoteId", "approvalId", "planHash", "idempotencyKey"]);
  return {
    rfqQuoteId: assertString(record, "rfqQuoteId"),
    approvalId: assertString(record, "approvalId"),
    planHash: assertString(record, "planHash"),
    idempotencyKey: assertString(record, "idempotencyKey"),
  };
}

export function acceptFirmQuote(args: {
  store: MemoryStore;
  rfqId: string;
  body: RfqAcceptBody;
  claims: ExecutionClaims;
  nowMs: number;
}): RfqQuote {
  const { store, rfqId, body, claims, nowMs } = args;
  const rfq = store.rfqs.get(rfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  const firm = rfq.quotes.find((quote) => quote.rfqQuoteId === body.rfqQuoteId);
  if (!firm) throw new ApiException(404, "QUOTE_NOT_FOUND", "Unknown firm quote");

  if (claims.sub !== body.approvalId) throw new ApiException(403, "CLAIM_MISMATCH", "approvalId does not match the execution token");
  if (claims.planHash !== body.planHash) throw new ApiException(403, "CLAIM_MISMATCH", "planHash does not match the execution token");
  if (claims.quoteId !== firm.rfqQuoteId) throw new ApiException(403, "CLAIM_MISMATCH", "quoteId claim must be the firm rfqQuoteId");
  if (claims.instrumentId !== rfq.rfqId) throw new ApiException(403, "CLAIM_MISMATCH", "instrumentId claim must be the rfqId");
  if (claims.venue !== "switchboard") throw new ApiException(403, "CLAIM_MISMATCH", "RFQ accept venue must be switchboard");
  if (claims.side !== "BUY") throw new ApiException(403, "CLAIM_MISMATCH", "RFQ accept side must be BUY");
  if (claims.mode !== "sandbox") throw new ApiException(403, "LIVE_MODE_DISABLED", "RFQ accept is sandbox-only");
  if (D(rfq.desiredQuantity).gt(D(claims.maxQuantity))) throw new ApiException(403, "CLAIM_MISMATCH", "RFQ quantity exceeds maxQuantity");
  if (D(firm.premiumUsd).gt(D(claims.maxSpendUsd))) throw new ApiException(403, "CLAIM_MISMATCH", "RFQ premium exceeds maxSpendUsd");
  if (!claims.canonicalTermsHash || claims.canonicalTermsHash !== firm.canonicalTermsHash || claims.canonicalTermsHash !== rfq.canonicalTermsHash) {
    throw new ApiException(409, "TERMS_HASH_MISMATCH", "Canonical terms hash does not match the firm quote");
  }
  if (firm.status === "ACCEPTED" && rfq.acceptedQuoteId === firm.rfqQuoteId) {
    return toQuote(firm);
  }
  if (nowMs >= Date.parse(firm.firmUntil) || nowMs >= Date.parse(rfq.expiresAt) || firm.status === "EXPIRED") {
    if (firm.status === "FIRM") {
      store.book.releaseFunds(firm.makerId, firm.lockedAmount);
      firm.status = "EXPIRED";
      firm.collateralReserved = false;
      firm.lockedAmount = D(0);
    }
    throw new ApiException(409, "QUOTE_EXPIRED", "Firm quote expired and cannot be accepted");
  }
  firm.status = "ACCEPTED";
  rfq.acceptedQuoteId = firm.rfqQuoteId;
  return toQuote(firm);
}

function toRequest(rfq: StoredRfq): RfqRequest {
  return {
    rfqId: rfq.rfqId,
    instrumentType: rfq.instrumentType,
    canonicalTermsHash: rfq.canonicalTermsHash,
    desiredQuantity: rfq.desiredQuantity,
    expiresAt: rfq.expiresAt,
    approvedJurisdiction: rfq.approvedJurisdiction,
  };
}

function toQuote(quote: StoredFirmQuote): RfqQuote {
  return {
    rfqId: quote.rfqId,
    rfqQuoteId: quote.rfqQuoteId,
    makerId: quote.makerId,
    premiumUsd: quote.premiumUsd,
    maxPayoutUsd: quote.maxPayoutUsd,
    firmUntil: quote.firmUntil,
    collateralReserved: quote.collateralReserved,
  };
}
