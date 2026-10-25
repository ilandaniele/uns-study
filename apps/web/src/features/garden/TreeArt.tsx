import { useId } from "react";
import type { GardenPlant, GardenSpecies } from "@sala/contracts";

/** Small original vector illustrations: no image downloads, fixed dimensions, distinct silhouettes. */
export function TreeArt({
  species,
  stage = "mature",
  decorative = true,
}: {
  species: GardenSpecies;
  stage?: GardenPlant["stage"];
  decorative?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const scale = stage === "young" ? 0.72 : 1;
  return (
    <svg
      viewBox="0 0 96 110"
      width="96"
      height="110"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : species.name}
      className="h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id={`${id}-leaf`} x2="0.8" y2="1">
          <stop stopColor={species.foliage} />
          <stop offset="1" stopColor={species.foliage} stopOpacity="0.74" />
        </linearGradient>
      </defs>
      <ellipse
        cx="48"
        cy="99"
        rx={stage === "seed" ? 10 : 28 * scale}
        ry="5"
        fill="#173e29"
        opacity="0.13"
      />
      {stage === "seed" ? (
        <g>
          <path d="M36 97q12-12 24 0" fill="#9f7950" />
          <path
            d="M48 95V81m0 8c-11 0-13-9-13-9 10-1 13 5 13 9m0-4c10 0 12-9 12-9-10 0-12 6-12 9"
            fill={species.foliage}
            stroke={species.foliage}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      ) : stage === "sprout" ? (
        <g>
          <path
            d="M48 98V65"
            stroke={species.bark}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M48 81C24 79 25 60 29 58c15 1 22 13 19 23M49 72c-2-19 9-24 20-23 1 13-6 22-20 23"
            fill={species.foliage}
          />
          <path
            d="M48 97c-6-2-9-1-13 0"
            stroke={species.bark}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g
          transform={`translate(${48 * (1 - scale)} ${99 * (1 - scale)}) scale(${scale})`}
        >
          <g className="garden-tree-crown">
            <path
              d={
                species.crown === "bottle"
                  ? "M39 99C42 80 34 74 40 57h15c8 20-1 27 4 42Z"
                  : "M43 99 45 58h6l3 41Z"
              }
              fill={species.bark}
            />
            <path
              d="M48 76 28 55m21 14 20-20M48 60V35"
              stroke={species.bark}
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            {species.crown === "conifer" ? (
              <g fill={`url(#${id}-leaf)`}>
                <path d="m48 13 9 15 18 5-15 6-12-4-13 4-15-6 19-5Z" />
                <path d="m48 34 14 17 23 4-17 8-20-7-20 7-18-8 24-4Z" />
                <path d="m48 56 13 15 19 4-14 7-18-6-18 6-14-7 20-4Z" />
              </g>
            ) : species.crown === "umbrella" ? (
              <g fill={`url(#${id}-leaf)`}>
                <ellipse cx="48" cy="44" rx="39" ry="21" />
                <ellipse cx="30" cy="36" rx="20" ry="13" />
                <ellipse cx="62" cy="34" rx="25" ry="16" />
              </g>
            ) : species.crown === "weeping" ? (
              <g fill={`url(#${id}-leaf)`}>
                <ellipse cx="48" cy="38" rx="29" ry="22" />
                <path d="M20 32Q5 58 20 77q0-20 14-24-10 27 0 35 1-25 15-34 8 24 14 29 9-19-1-35 19 9 16 29 15-27-3-44Z" />
              </g>
            ) : (
              <g fill={`url(#${id}-leaf)`}>
                <ellipse cx="28" cy="49" rx="21" ry="23" />
                <ellipse cx="66" cy="50" rx="23" ry="24" />
                <ellipse cx="49" cy="34" rx="27" ry="27" />
                <ellipse cx="46" cy="57" rx="25" ry="19" />
              </g>
            )}
            <path
              d="M24 43q3-12 13-13M44 23q11-6 19 4"
              fill="none"
              stroke="white"
              strokeOpacity="0.15"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {species.flower ? (
              <g fill={species.flower}>
                {[
                  [23, 43],
                  [39, 31],
                  [56, 24],
                  [72, 43],
                  [52, 51],
                  [34, 57],
                  [66, 59],
                  [42, 44],
                ].map(([x, y]) => (
                  <g key={`${x}-${y}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={
                        species.id === "jacaranda" || species.id === "lapacho"
                          ? 6.5
                          : 3.7
                      }
                    />
                    <circle cx={x + 3} cy={y - 2} r="2.5" opacity="0.7" />
                  </g>
                ))}
              </g>
            ) : (
              <g fill="white" opacity="0.12">
                <circle cx="31" cy="43" r="5" />
                <circle cx="61" cy="39" r="7" />
              </g>
            )}
          </g>
        </g>
      )}
    </svg>
  );
}
