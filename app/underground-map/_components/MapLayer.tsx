import { memo } from "react";
import { mapFont } from "../_lib/fonts";
import { type RenderModel, type Theme, TUBE } from "../_lib/render";

interface Props {
  model: RenderModel;
  theme: Theme;
  intro: boolean;
}

/** Tracks, ticks and station markers. Pure — also what gets exported. */
export const MapGraphics = memo(function MapGraphics({
  model,
  theme,
  intro,
}: Props) {
  const lw = TUBE.lineWidth;
  const tickW = lw * 0.72;

  return (
    <g id="map-graphics">
      <g
        fill="none"
        strokeLinecap="butt"
        strokeLinejoin="round"
        strokeWidth={lw}
      >
        {model.tracks.map((t) => (
          <path
            key={t.id}
            d={t.d}
            stroke={t.color}
            pathLength={intro ? 1 : undefined}
            className={intro ? "draw-in" : undefined}
            style={intro ? { animationDelay: `${t.delay}ms` } : undefined}
          />
        ))}
      </g>

      <g strokeLinecap="butt">
        {model.stations.map(
          (rs) =>
            rs.tick && (
              <line
                key={`${rs.s.id}-tick`}
                className="pop"
                style={intro ? { transitionDelay: `${rs.delay}ms` } : undefined}
                x1={rs.tick.x1}
                y1={rs.tick.y1}
                x2={rs.tick.x2}
                y2={rs.tick.y2}
                stroke={rs.color ?? theme.ink}
                strokeWidth={tickW}
              />
            ),
        )}
      </g>

      <g>
        {model.stations.map((rs) => {
          const m = rs.marker;
          if (!m) return null;
          const stroke =
            rs.kind === "single" ? (rs.color ?? theme.ink) : theme.ink;
          return (
            <circle
              key={`${rs.s.id}-${rs.kind}`}
              className="pop"
              style={intro ? { transitionDelay: `${rs.delay}ms` } : undefined}
              cx={m.x}
              cy={m.y}
              r={m.r}
              fill={theme.fill}
              stroke={stroke}
              strokeWidth={rs.ring}
            />
          );
        })}
      </g>
    </g>
  );
});

export const MapLabels = memo(function MapLabels({
  model,
  theme,
  intro,
  hidden,
}: Props & { hidden: string | null }) {
  return (
    <g
      id="map-labels"
      fontFamily={mapFont.style.fontFamily}
      fontSize={TUBE.labelSize}
      fill={theme.label}
      stroke={theme.halo}
      strokeWidth={TUBE.labelSize * 0.3}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {model.stations.map((rs) =>
        rs.s.id === hidden ? null : (
          <text
            key={rs.s.id}
            data-label={rs.s.id}
            className="map-label fade-in"
            style={
              intro ? { transitionDelay: `${rs.delay + 120}ms` } : undefined
            }
            x={rs.label.x}
            y={rs.label.y}
            dy={rs.label.dy}
            textAnchor={rs.label.anchor}
          >
            {rs.s.name}
          </text>
        ),
      )}
    </g>
  );
});
