const DECIMAL_AMOUNT_REGEX = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Format an integer amount of cents as a decimal string, e.g. 9990 -> "99.90".
 */
export const formatCentsAsDecimal = (cents: number) => {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('Amount in cents must be a non-negative integer');
  }

  const units = Math.floor(cents / 100);
  const remainder = cents % 100;

  return `${units}.${remainder.toString().padStart(2, '0')}`;
};

/**
 * Parse a decimal amount such as "99.90" into integer cents.
 *
 * Works on the digits of the string instead of multiplying floats, so "0.29" is
 * 29 cents and never 28. Returns null for anything that is not a non-negative
 * amount with at most two decimal places.
 */
export const parseDecimalToCents = (value: string | number) => {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }

  const match = DECIMAL_AMOUNT_REGEX.exec(String(value));

  if (!match) {
    return null;
  }

  const [, units, decimals = ''] = match;

  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents)) {
    return null;
  }

  return cents;
};
