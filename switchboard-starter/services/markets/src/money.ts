import { Decimal } from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const MONEY = /^-?[0-9]+(?:\.[0-9]+)?$/;

export function D(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return new Decimal(value);
  }
  if (!MONEY.test(value)) throw new Error(`invalid decimal ${value}`);
  return new Decimal(value);
}

export function isMoney(value: unknown): value is string {
  return typeof value === "string" && MONEY.test(value);
}

/** Decimal string, trimmed, never scientific notation. */
export function money(value: Decimal): string {
  const rounded = value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  if (rounded.isZero()) return "0";
  return rounded.toFixed(8).replace(/\.?0+$/, "");
}
