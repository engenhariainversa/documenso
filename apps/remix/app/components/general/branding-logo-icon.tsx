import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

/**
 * Provisional Docverse icon mark (compact/square variant).
 *
 * TODO: replace with the final Docverse visual identity (see design task).
 */
export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84" {...props}>
      <text
        x="42"
        y="58"
        textAnchor="middle"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="56"
        fontWeight="700"
        fill="currentColor"
      >
        D
      </text>
    </svg>
  );
};
