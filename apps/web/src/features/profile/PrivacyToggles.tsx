"use client";

import type { PrivacySettingsDto } from "@uns/contracts";
import { PRIVACY_FIELDS, privacyFieldDisabled } from "./privacy-fields";
import type { PrivacyPatch } from "./useMyProfile";

export interface PrivacyTogglesProps {
  privacy: PrivacySettingsDto;
  saving: boolean;
  onChange: (patch: PrivacyPatch) => void;
}

/** Per-field privacy toggles ("Qué ve la gente de mí") — every field defaults to private (07_SECURITY §privacy). */
export function PrivacyToggles({ privacy, saving, onChange }: PrivacyTogglesProps) {
  return (
    <div className="flex flex-col divide-y divide-slate-100">
      {PRIVACY_FIELDS.map((field) => {
        const checked = privacy[field.key];
        const disabled = saving || privacyFieldDisabled(field.key, privacy);
        return (
          <label key={field.key} className="flex items-start justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">{field.label}</span>
              <span className="block text-xs text-slate-500">{field.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onChange({ [field.key]: e.target.checked } as PrivacyPatch)}
              className="mt-1 h-5 w-5 shrink-0 accent-primary disabled:opacity-40"
            />
          </label>
        );
      })}
    </div>
  );
}
