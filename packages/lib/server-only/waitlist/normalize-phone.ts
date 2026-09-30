const onlyDigits = (value: string) => value.replace(/\D+/g, '');

export type NormalizeWaitlistPhoneOptions = {
  /** Country calling code, e.g. "55" */
  country: string;
  /** Area code, e.g. "62" */
  area: string;
  /** Local number, e.g. "999999999" */
  number: string;
};

/**
 * Builds the E.164 form ("+5562999999999") from the three fields of the waitlist form.
 *
 * Length validation lives in the request schema; this only normalises.
 */
export const normalizeWaitlistPhone = ({ country, area, number }: NormalizeWaitlistPhoneOptions) => {
  const countryDigits = onlyDigits(country).replace(/^0+/, '');
  const areaDigits = onlyDigits(area);
  const numberDigits = onlyDigits(number);

  if (!countryDigits || !areaDigits || !numberDigits) {
    throw new Error('Every phone part must contain digits');
  }

  return `+${countryDigits}${areaDigits}${numberDigits}`;
};
