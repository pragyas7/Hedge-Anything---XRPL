import { createRequire } from "node:module";

/**
 * decimal.js 10.6 is CJS (`module.exports = Decimal`) plus an ESM build.
 * NodeNext types the default import as a non-constructable namespace, so
 * this module loads the constructor with createRequire and keeps the class private.
 */
interface Money {
  isFinite(): boolean;
  decimalPlaces(): number;
  toFixed(digits?: number): string;
  gt(other: string | number | Money): boolean;
  plus(other: string | Money): Money;
  minus(other: string | Money): Money;
  div(other: string | Money): Money;
}

interface MoneyCtor {
  new (value: string | number | Money): Money;
  min(...values: Array<string | Money>): Money;
  max(...values: Array<string | Money>): Money;
}

const require = createRequire(import.meta.url);
const loaded = require("decimal.js") as MoneyCtor;
const Decimal: MoneyCtor = loaded;

const MONEY = /^-?[0-9]+(?:\.[0-9]+)?$/;

export function isMoney(value: unknown): value is string {
  return typeof value === "string" && MONEY.test(value);
}

export function toDecimalString(value: string | Money): string {
  const amount = typeof value === "string" ? new Decimal(value) : value;
  if (!amount.isFinite()) throw new Error("non-finite decimal");
  let text = amount.toFixed(Math.max(0, amount.decimalPlaces()));
  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (text === "-0") return "0";
  return text;
}

export function greaterThan(left: string, right: string): boolean {
  return new Decimal(left).gt(right);
}

export function minDecimal(values: string[]): string {
  if (values.length === 0) throw new Error("empty decimal list");
  let best: Money = new Decimal(values[0] as string);
  for (const value of values.slice(1)) best = Decimal.min(best, value);
  return toDecimalString(best);
}

export function maxDecimal(left: string, right: string): string {
  return toDecimalString(Decimal.max(left, right));
}

export function addMoney(left: string, right: string): string {
  return toDecimalString(new Decimal(left).plus(right));
}

export function subtractMoney(left: string, right: string): string {
  return toDecimalString(new Decimal(left).minus(right));
}

/** All-in unit price bound: estimatedAllInCostUsd / quantity. */
export function allInUnitPrice(costUsd: string, quantity: string): string {
  const qty = new Decimal(quantity);
  if (!qty.gt(0)) throw new Error("INVALID_QUANTITY");
  return toDecimalString(new Decimal(costUsd).div(qty));
}

export function sumMoney(values: string[]): string {
  return toDecimalString(values.reduce((acc, value) => acc.plus(value), new Decimal(0)));
}
