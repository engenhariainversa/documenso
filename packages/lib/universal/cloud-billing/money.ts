/**
 * Intl puts a non-breaking space after the currency symbol. Built from its code so
 * that no editor or formatter can silently turn it into a plain space.
 */
const NON_BREAKING_SPACE = String.fromCharCode(0xa0);

export type FormatCentsAsCurrencyOptions = {
  cents: number;
  currency: string;
};

/**
 * Format an amount for display, e.g. 9990 BRL -> "R$ 99,90".
 *
 * Always uses the Brazilian format: the plan is priced and charged in reais.
 */
export const formatCentsAsCurrency = ({ cents, currency }: FormatCentsAsCurrencyOptions) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
    .format(cents / 100)
    .replaceAll(NON_BREAKING_SPACE, ' ');
};
