import { describe, expect, it } from 'vitest';

import { formatCentsAsCurrency } from './money';

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
