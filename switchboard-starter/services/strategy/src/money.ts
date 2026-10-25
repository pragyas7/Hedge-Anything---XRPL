import { Decimal } from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const MONEY_PATTERN = /^-?[0-9]+(?:\.[0-9]+)?$/;

export function dec(value: Decimal.Value): Decimal {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('non-finite number');
    }
    return new Decimal(value.toString());
  }
  return new Decimal(value);
}

/** Shortest plain decimal string. No scientific notation, no float binary. */
export function money(value: Decimal.Value): string {
  const parsed = value instanceof Decimal ? value : dec(value);
  if (!parsed.isFinite()) {
    throw new Error('non-finite money');
  }
  let rendered = parsed.toFixed(8);
  if (rendered.includes('.')) {
    rendered = rendered.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (rendered === '-0') return '0';
  return rendered;
}

export function isMoneyString(value: unknown): value is string {
  return typeof value === 'string' && MONEY_PATTERN.test(value);
}

export { Decimal };
