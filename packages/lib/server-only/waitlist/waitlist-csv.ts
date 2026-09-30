export type WaitlistCsvEntry = {
  name: string;
  email: string;
  phone: string;
  locale: string;
  consentVersion: string;
  consentedAt: Date;
  createdAt: Date;
  invitedAt: Date | null;
};

const CSV_HEADER = ['name', 'email', 'phone', 'locale', 'consentVersion', 'consentedAt', 'createdAt', 'invitedAt'];

/**
 * A leading formula character would be run by a spreadsheet when the file is opened.
 * Prefixing an apostrophe makes the cell plain text. A signed number such as an E.164
 * phone ("+5562999999999") is left alone: it is data, not a formula.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const SIGNED_NUMBER = /^[+-]\d+$/;

const csvCell = (value: string) => {
  const safe = FORMULA_PREFIX.test(value) && !SIGNED_NUMBER.test(value) ? `'${value}` : value;

  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/**
 * CSV export of the waitlist for the admin. Dates are ISO 8601 in UTC.
 */
export const waitlistEntriesToCsv = (entries: WaitlistCsvEntry[]) => {
  const lines = entries.map((entry) =>
    [
      entry.name,
      entry.email,
      entry.phone,
      entry.locale,
      entry.consentVersion,
      entry.consentedAt.toISOString(),
      entry.createdAt.toISOString(),
      entry.invitedAt?.toISOString() ?? '',
    ]
      .map(csvCell)
      .join(','),
  );

  return [CSV_HEADER.join(','), ...lines].join('\n');
};
