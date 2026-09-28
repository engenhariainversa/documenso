import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

/**
 * Provisional Docverse wordmark.
 *
 * TODO: replace with the final Docverse visual identity (see design task).
 */
export const BrandingLogo = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 25" {...props}>
      <text x="0" y="20" fontFamily="Inter, Arial, sans-serif" fontSize="22" fontWeight="700" fill="currentColor">
        Docverse
      </text>
    </svg>
  );
};
