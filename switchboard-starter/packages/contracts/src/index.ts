/** Switchboard shared DTOs. Normative HTTP schema: contracts/openapi.yaml.
 * Monetary amount is a decimal string. Never use JS floats for settlement math.
 */
export type CurrencyAmount = string;
export type ISODateTime = string;
export type Capability = 'live' | 'sandbox' | 'read_only' | 'unsupported';
export type Venue = 'kalshi' | 'polymarket_us' | 'polymarket_international' | 'switchboard' | 'capacity_provider';
export type Comparison = 'direct' | 'proxy' | 'not_comparable';
export type RiskCategory = 'operational' | 'digital' | 'climate' | 'commodity' | 'supply_chain' | 'regulatory' | 'financial' | 'other';
export type HedgeKind = 'financial' | 'capacity';

export interface Scenario { scenarioId: string; label: string; probability: number; baselineLossUsd: CurrencyAmount; factorShocks: Record<string, number>; source: 'synthetic' | 'historical' | 'user_supplied'; }
export interface RiskExposure { exposureId: string; category: RiskCategory; label: string; description: string; riskFactors: string[]; horizonDays: number; scenarioIds: string[]; confidence: number; }
export interface CompanyProfile { companyId: string; name: string; description: string; jurisdiction: string; baseCurrency: 'USD'; monthlyHedgeBudgetUsd: CurrencyAmount; maxTolerableTailLossUsd: CurrencyAmount; cvarAlpha: number; exposures: RiskExposure[]; scenarios: Scenario[]; confirmedByUser: boolean; }
export interface CompanyAnalysisResponse { company: CompanyProfile; assumptions: string[]; warnings: string[]; }

export type SettlementType = 'binary' | 'capped_call' | 'capacity_option';
export interface Instrument { instrumentId: string; venue: Venue; name: string; riskFactor: string; settlementType: SettlementType; eventRule: string; resolutionSourceUrl: string; expiresAt: ISODateTime; payoutPerUnitUsd: CurrencyAmount; maximumPayoutUsd: CurrencyAmount; collateralCurrency: string; unitDescription: string; comparisonGroupId?: string; }
export interface FeeBreakdown { tradingFeeUsd: CurrencyAmount; networkFeeUsd: CurrencyAmount; conversionFeeUsd: CurrencyAmount; modeledSlippageUsd: CurrencyAmount; otherFeeUsd: CurrencyAmount; }
export interface MarketQuote { quoteId: string; instrument: Instrument; venue: Venue; capability: Capability; comparison: Comparison; eligibilityReason: string; bidUsd: CurrencyAmount; askUsd: CurrencyAmount; requestedQuantity: CurrencyAmount; availableQuantity: CurrencyAmount; estimatedAllInBuyCostUsd: CurrencyAmount; fees: FeeBreakdown; quotedAt: ISODateTime; expiresAt: ISODateTime; source: 'live' | 'synthetic' | 'sandbox'; basisRiskDescription: string; }
export interface CapacityOffer { offerId: string; providerName: string; qualifiedTask: string; region: string; throughputPerSecond: number; guaranteedPricePerRequestUsd: CurrencyAmount; reservationPremiumUsd: CurrencyAmount; reservedUntil: ISODateTime; verifiedCapacity: boolean; qualificationBenchmark: string; capability: Capability; }
export interface MarketSearchRequest { companyId: string; exposureIds: string[]; requestedQuantity: CurrencyAmount; jurisdiction: string; includeReferenceMarkets: boolean; }
export interface MarketSearchResponse { companyId: string; quotes: MarketQuote[]; capacityOffers: CapacityOffer[]; retrievedAt: ISODateTime; warnings: string[]; }

export interface TailRiskMetrics { expectedLossUsd: CurrencyAmount; p95LossUsd: CurrencyAmount; cvar95LossUsd: CurrencyAmount; worstScenarioLossUsd: CurrencyAmount; }
export interface HedgeLeg { legId: string; kind: HedgeKind; quoteId?: string; instrumentId?: string; capacityOfferId?: string; venue: Venue; quantity: CurrencyAmount; estimatedAllInCostUsd: CurrencyAmount; maxAdditionalObligationUsd: CurrencyAmount; payoffByScenarioUsd: Record<string, CurrencyAmount>; basisRisk: string; }
export type PlanStatus = 'DRAFT' | 'QUOTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'ACTIVE' | 'REAPPROVAL_REQUIRED' | 'REJECTED' | 'EXPIRED' | 'PARTIALLY_EXECUTED' | 'FAILED';
export interface HedgePlan { planId: string; companyId: string; version: number; status: PlanStatus; createdAt: ISODateTime; expiresAt: ISODateTime; planHash: string; budgetUsd: CurrencyAmount; estimatedTotalCostUsd: CurrencyAmount; before: TailRiskMetrics; after: TailRiskMetrics; legs: HedgeLeg[]; rationale: string; warnings: string[]; syntheticDemo: boolean; }
export interface GenerateStrategyRequest { company: CompanyProfile; marketSearch: MarketSearchResponse; mode: 'min_cvar' | 'min_cost' | 'balanced'; }

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'UNSUPPORTED';
export interface ApprovalRequest { planId: string; planHash: string; expiresAt: ISODateTime; maxTotalSpendUsd: CurrencyAmount; maxCollateralUsd: CurrencyAmount; allowedVenues: Venue[]; ap4mFallbackBudgetUsd: CurrencyAmount; }
export interface Approval { approvalId: string; request: ApprovalRequest; status: ApprovalStatus; method: 'app_manual' | 'ledger_agent_intent' | 'ledger_dmk_verified' | 'external_wallet'; deviceProofId?: string; approvedAt?: ISODateTime; }
export interface MarketOrderRequest { approvalId: string; planHash: string; quoteId: string; side: 'BUY' | 'SELL'; quantity: CurrencyAmount; limitPriceUsd: CurrencyAmount; clientOrderId: string; }
export type OrderStatus = 'CREATED' | 'ACCEPTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'SIMULATED';
export interface MarketOrderResult { clientOrderId: string; venueOrderId: string; status: OrderStatus; filledQuantity: CurrencyAmount; averageFillPriceUsd: CurrencyAmount; txHash?: string; syntheticDemo: boolean; }
export interface ExecutionRunRequest { plan: HedgePlan; approvalId: string; idempotencyKey: string; }
export interface ExecutionRun { runId: string; planId: string; approvalId: string; status: 'PENDING' | 'EXECUTING' | 'PARTIAL' | 'ACTIVE' | 'FAILED' | 'REAPPROVAL_REQUIRED'; orders: MarketOrderResult[]; receipts: SettlementReceipt[]; correlationId: string; }
export interface SettlementReceipt { receiptId: string; kind: 'market_fill' | 'voucher_redeemed' | 'rlusd_settlement' | 'service_unlocked' | 'exchange_settlement'; chainId?: number; transactionHash?: string; confirmed: boolean; observedAt: ISODateTime; metadata: Record<string, string>; }
export type FailoverState = 'HEALTHY' | 'SUSPECT' | 'VERIFIED_FAILURE' | 'SEARCHING_FALLBACK' | 'QUOTED_402' | 'VOUCHER_SIGNED' | 'VOUCHER_REDEEMED' | 'RLUSD_SETTLED' | 'FALLBACK_ACTIVE' | 'BUDGET_BLOCKED' | 'UNAVAILABLE' | 'UNVERIFIED' | 'FAIL_CLOSED';
export interface FailoverRun { failoverId: string; planId: string; primaryService: string; fallbackService: string; state: FailoverState; ap4mSpendingUsd: CurrencyAmount; receipts: SettlementReceipt[]; correlationId: string; errors: string[]; }

export interface RfqRequest { rfqId?: string; instrumentType: SettlementType; canonicalTermsHash: string; desiredQuantity: CurrencyAmount; expiresAt: ISODateTime; approvedJurisdiction: string; }
export interface RfqQuote { rfqId: string; rfqQuoteId: string; makerId: string; premiumUsd: CurrencyAmount; maxPayoutUsd: CurrencyAmount; firmUntil: ISODateTime; collateralReserved: boolean; }
export interface ExchangeOrder { instrumentId: string; side: 'BUY' | 'SELL'; priceUsd: CurrencyAmount; quantity: CurrencyAmount; nonce: string; goodTil: ISODateTime; clientOrderId: string; }
export interface OrderbookLevel { priceUsd: CurrencyAmount; quantity: CurrencyAmount; }
export interface ExchangeOrderbook { instrumentId: string; bids: OrderbookLevel[]; asks: OrderbookLevel[]; updatedAt: ISODateTime; mode: 'sandbox' | 'live'; }

export interface ApiError { code: string; message: string; correlationId: string; retryable: boolean; details?: Record<string, unknown>; }

export interface FailoverArmRequest { planId: string; approvalId: string; primaryService: string; fallbackOfferId: string; maxPerTriggerUsd: CurrencyAmount; maxDailySpendUsd: CurrencyAmount; triggerRuleId: string; }
export interface FailoverArmResponse { monitorId: string; status: 'ARMED' | 'DISABLED' | 'REJECTED'; policyDigest: string; }
export interface FailoverDisableRequest { monitorId: string; reason: string; }
export interface InstrumentList { instruments: Instrument[]; retrievedAt: ISODateTime; mode: 'sandbox' | 'live'; }
export interface CompanyAnalyzeRequest { description: string; jurisdiction: string; monthlyHedgeBudgetUsd: CurrencyAmount; maxTolerableTailLossUsd: CurrencyAmount; }
export interface ApprovalConfirmRequest { method: 'app_manual' | 'ledger_agent_intent' | 'ledger_dmk_verified' | 'external_wallet'; signedIntent: string; deviceProofId?: string; }
