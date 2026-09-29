import { describe, expect, it } from 'vitest';

import { formatCentsAsCurrency, formatCentsAsDecimal, parseDecimalToCents } from './money';

describe('formatCentsAsDecimal', () => {
  it.each([
    [9990, '99.90'],
    [5, '0.05'],
    [0, '0.00'],
    [100000, '1000.00'],
    [35000, '350.00'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatCentsAsDecimal(cents)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (cents) => {
    expect(() => formatCentsAsDecimal(cents)).toThrow();
  });
});

describe('parseDecimalToCents', () => {
  it.each([
    ['99.90', 9990],
    ['99.9', 9990],
    ['350.00', 35000],
    ['350', 35000],
    ['0.29', 29],
    ['0.07', 7],
    ['1000.10', 100010],
    [99.9, 9990],
    [0.29, 29],
    [350, 35000],
  ])('parses %j as %i cents', (value, expected) => {
    expect(parseDecimalToCents(value)).toBe(expected);
  });

  it.each([
    'abc',
    '',
    ' ',
    '-1',
    '-0.50',
    '1.999',
    '1,50',
    '1e3',
    Number.NaN,
    -5,
    Number.POSITIVE_INFINITY,
    1.999,
  ])('returns null for %j', (value) => {
    expect(parseDecimalToCents(value)).toBeNull();
  });
});

describe('formatCentsAsCurrency', () => {
  it('formats reais the Brazilian way', () => {
    expect(formatCentsAsCurrency({ cents: 9990, currency: 'BRL' })).toBe('R$ 99,90');
  });

  it('separates thousands with a dot', () => {
    expect(formatCentsAsCurrency({ cents: 123456, currency: 'BRL' })).toBe('R$ 1.234,56');
  });

  it('formats zero', () => {
    expect(formatCentsAsCurrency({ cents: 0, currency: 'BRL' })).toBe('R$ 0,00');
  });

  it('uses a plain space, so the text can be compared and copied', () => {
    expect(formatCentsAsCurrency({ cents: 9990, currency: 'BRL' })).not.toMatch(/\u00a0/);
  });
});
