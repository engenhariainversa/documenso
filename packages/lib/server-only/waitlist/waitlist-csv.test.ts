import { describe, expect, it } from 'vitest';

import { waitlistEntriesToCsv } from './waitlist-csv';

const ENTRY = {
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '+5562999999999',
  locale: 'pt-BR',
  consentVersion: '2026-09-29',
  consentedAt: new Date('2026-09-29T12:00:00.000Z'),
  createdAt: new Date('2026-09-29T12:00:01.000Z'),
  invitedAt: null,
};

describe('waitlistEntriesToCsv', () => {
  it('writes a header and one line per entry, with dates in ISO and empty invitedAt', () => {
    const csv = waitlistEntriesToCsv([ENTRY]);

    expect(csv.split('\n')).toEqual([
      'name,email,phone,locale,consentVersion,consentedAt,createdAt,invitedAt',
      'Ana Souza,ana@exemplo.com,+5562999999999,pt-BR,2026-09-29,2026-09-29T12:00:00.000Z,2026-09-29T12:00:01.000Z,',
    ]);
  });

  it('quotes values with commas, quotes or line breaks', () => {
    const csv = waitlistEntriesToCsv([
      { ...ENTRY, name: 'Souza, Ana "Aninha"\nLima', invitedAt: new Date('2026-10-01T00:00:00.000Z') },
    ]);

    expect(csv.split('\n').slice(1).join('\n')).toBe(
      '"Souza, Ana ""Aninha""\nLima",ana@exemplo.com,+5562999999999,pt-BR,2026-09-29,2026-09-29T12:00:00.000Z,2026-09-29T12:00:01.000Z,2026-10-01T00:00:00.000Z',
    );
  });

  it('neutralises values that a spreadsheet would run as a formula', () => {
    const csv = waitlistEntriesToCsv([{ ...ENTRY, name: '=SUM(1)' }]);

    expect(csv.split('\n')[1].startsWith("'=SUM(1),")).toBe(true);
  });

  it('keeps the E.164 phone as is, since a signed number is data and not a formula', () => {
    const csv = waitlistEntriesToCsv([ENTRY]);

    expect(csv.split('\n')[1]).toContain(',+5562999999999,');
  });
});
