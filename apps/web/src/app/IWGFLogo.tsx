import type { FC } from 'react';
import { GALAXY_BOUNDS, GALAXY_CENTER_X, GalaxyPath } from './Galaxy';

export interface IWGFLogoProps {
  width?: number;
  className?: string;
  warpColor?: string;
  galaxyColor?: string;
  textColor?: string;
  marginLeft?: string;
}

const FONT_SIZE = 36;
const LINE_SPACING = 50;
const GALAXY_GAP = 16;
const LOGO_WIDTH = 1024;
const LOGO_CENTER_X = LOGO_WIDTH / 2;

/** Layout in a tight local box — galaxy top at y=0, text stacked below. */
const GALAXY_HEIGHT = GALAXY_BOUNDS.height;
const TITLE_Y = GALAXY_HEIGHT + GALAXY_GAP + FONT_SIZE;
const ACRONYM_Y = TITLE_Y + LINE_SPACING;
const LOGO_HEIGHT = ACRONYM_Y;

const GALAXY_TRANSFORM = `translate(${LOGO_CENTER_X - GALAXY_CENTER_X}, ${-GALAXY_BOUNDS.y})`;

export const IWGFLogo: FC<IWGFLogoProps> = ({
  width,
  className,
  marginLeft,
  warpColor = '#38bdf8',
  galaxyColor = '#ffffff',
  textColor = '#ffffff',
}) => {
  return (
    <svg
      style={marginLeft ? { marginLeft } : undefined}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
      width={width}
      className={className}
      aria-label="Interstellar Warp Gaming Federation"
    >
      <defs>
        <style>{`
          .cls-1 {
            fill: ${galaxyColor};
            fill-rule: evenodd;
          }

          .cls-2 {
            fill: ${textColor};
            font-family: Federation, Federation;
            font-size: ${FONT_SIZE}px;
          }

          .cls-3 {
            fill: ${warpColor};
            font-family: FederationWide, FederationWide;
            font-size: ${FONT_SIZE}px;
          }
        `}</style>
      </defs>
      <g transform={GALAXY_TRANSFORM}>
        <GalaxyPath className="cls-1" fill={galaxyColor} />
      </g>
      <text
        className="cls-2"
        textAnchor="middle"
        x={LOGO_CENTER_X}
        y={TITLE_Y}
      >
        Interstellar Warp Gaming Federation
      </text>
      <text className="cls-3" textAnchor="middle" x={LOGO_CENTER_X} y={ACRONYM_Y}>
        IWGF
      </text>
    </svg>
  );
};
