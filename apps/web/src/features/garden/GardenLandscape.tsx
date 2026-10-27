const STREAM = "M410 112C405 125 394 132 374 142S338 162 314 173 279 192 254 204 219 225 197 234 162 253 145 279";

/** Decorative water and banks never intercept taps or change plot identities. */
export function GardenLandscape() {
  return <g aria-hidden="true" pointerEvents="none">
    <ellipse cx="300" cy="371" rx="228" ry="21" fill="var(--garden-empty)" opacity=".12" />
    <path d={STREAM} fill="none" stroke="var(--garden-water-deep)" strokeWidth="32" strokeLinecap="round" />
    <path d={STREAM} fill="none" stroke="var(--garden-water)" strokeWidth="23" strokeLinecap="round" />
    <path className="garden-stream-current" d={STREAM} fill="none" stroke="var(--garden-water-light)" strokeWidth="1.6" strokeDasharray="10 14" opacity=".65" />
    <path d="M48 199 144 249v20L48 219Z" fill="#a58c61" />
    <path d="M384 124 144 249v7L384 131Z" fill="#84724e" />
    <path d="M288 74 384 124 144 249 48 199Z" fill="var(--garden-soil)" stroke="var(--garden-tile-border)" />
    <path d="M168 261 312 336v20L168 281Z" fill="#a58c61" />
    <path d="M552 211 312 336v20L552 231Z" fill="#826945" />
    <path d="M408 136 552 211 312 336 168 261Z" fill="var(--garden-soil)" stroke="var(--garden-tile-border)" />
    <g fill="var(--garden-empty)" opacity=".45"><path d="m81 276 4-8 3 9 5-5-2 10M505 139l3-9 4 10 5-4-3 11" /></g>
  </g>;
}

export function GardenBridge() {
  return <g aria-hidden="true" pointerEvents="none" strokeLinecap="round">
    <path d="m257 176 36 18-12 8-36-18Z" fill="#6c5038" />
    <path d="m257 172 36 18-12 8-36-18Z" fill="#c09b65" stroke="#785d3d" />
    <path d="m255 177 32 16m-26-20-12 8m19-4-12 8m19-4-12 8m19-4-12 8" stroke="#8f6c46" strokeWidth="1.2" />
  </g>;
}
