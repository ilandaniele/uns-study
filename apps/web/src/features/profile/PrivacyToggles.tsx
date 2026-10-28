"use client";

import type { PrivacySettingsDto } from "@sala/contracts";
import { PRIVACY_FIELDS } from "./privacy-fields";
import type { PrivacyPatch } from "./useMyProfile";

export interface PrivacyTogglesProps {
  privacy: PrivacySettingsDto;
  saving: boolean;
  /** Admins also see the "insignia de admin" toggle. */
  isAdmin?: boolean;
  onChange: (patch: PrivacyPatch) => void;
}

/** Per-field privacy toggles ("Qué ve la gente de mí") — every field defaults to private (07_SECURITY §privacy). */
export function PrivacyToggles({ privacy, saving, isAdmin = false, onChange }: PrivacyTogglesProps) {
  return (
    <div className="flex flex-col divide-y divide-[var(--border)]">
      <p className="pb-3 text-xs leading-relaxed text-muted">Estas opciones controlan lo que ven las demás personas. Sólo el súper admin (titular y desarrollador de la app) puede consultar los datos guardados, incluidos los ocultos, para administrar y moderar la app. Sus consultas quedan registradas.</p>
      {PRIVACY_FIELDS.filter((field) => isAdmin || !field.adminOnly).map((field) => {
        const checked = privacy[field.key] ?? true;
        const disabled = saving;
        return (
          <div key={field.key} className="flex items-start justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-medium text-main">{field.label}</span>
              <span className="block text-xs text-muted">{field.hint}</span>
            </span>
            <PrivacySwitch
              checked={checked}
              disabled={disabled}
              label={field.label}
              onChange={(next) => onChange({ [field.key]: next } as PrivacyPatch)}
            />
          </div>
        );
      })}
    </div>
  );
}

function PrivacySwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-app transition-colors before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-[var(--surface-2)]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
