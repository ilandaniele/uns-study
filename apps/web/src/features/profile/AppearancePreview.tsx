import type { MyProfileDto, PrivacySettingsDto } from "@sala/contracts";
import { OccupantAvatar } from "@/features/room/OccupantAvatar";
import { computeAppearance } from "./appearance";

/** "Cómo te ven los demás": preview of the SAVED profile + privacy, drawn with the same avatars as the map. */
export function AppearancePreview({ profile, privacy }: { profile: MyProfileDto; privacy: PrivacySettingsDto }) {
  const appearance = computeAppearance(profile, privacy);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <OccupantAvatar avatar={appearance.avatar} size={64} adminBadge={appearance.adminBadge} className="mb-1" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-main">{appearance.name}</p>
          {appearance.rows.length > 0 ? (
            <dl className="mt-1 flex flex-col gap-0.5 text-sm">
              {appearance.rows.map((row) => (
                <div key={row.label} className="flex gap-1.5">
                  <dt className="text-muted">{row.label}:</dt>
                  <dd className="min-w-0 truncate text-main">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
      {!appearance.identityVisible ? <p className="text-xs text-muted">Elegiste ocultar tu identidad: aparecés como tu animal.</p> : null}
    </div>
  );
}
