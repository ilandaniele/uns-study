"use client";

import type { MyProfileDto, PrivacySettingsDto } from "@uns/contracts";
import { ShuffleIcon } from "@phosphor-icons/react/dist/ssr";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import type { ProfilePatch } from "./useMyProfile";
import { IDENTITY_MODES, identityModeHint, identityModeLabel, needsRoomVisibility, previewDisplayName } from "./identity-mode";
import { CareerSelect } from "./CareerSelect";
import { careerChoiceFromValue, careerValueFromChoice } from "./career-choice";

export interface ProfileFormProps {
  profile: MyProfileDto;
  privacy: PrivacySettingsDto;
  saving: boolean;
  onSave: (patch: ProfilePatch) => Promise<boolean>;
  onRerollAlias: () => Promise<string | null>;
  /** Turns on `showInRoom` + `showSeat` (and the active check-in's identity, if any). */
  onShowMeInRoom: () => Promise<boolean>;
}

/** "Editar perfil" form: name/nickname/career/bio/instagram/legajo + identity-mode selector. */
export function ProfileForm({ profile, privacy, saving, onSave, onRerollAlias, onShowMeInRoom }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [career, setCareer] = useState(() => careerChoiceFromValue(profile.career));
  const [currentSubject, setCurrentSubject] = useState(profile.currentSubject ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [instagram, setInstagram] = useState(profile.instagram ?? "");
  const [studentNumber, setStudentNumber] = useState(profile.studentNumber ?? "");
  const [identityMode, setIdentityMode] = useState(profile.identityMode);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const shownName = previewDisplayName(identityMode, { firstName, lastName, nickname });
  const offerRoomVisibility = shownName !== null && needsRoomVisibility(identityMode, privacy);

  async function handleReroll() {
    setRerolling(true);
    await onRerollAlias();
    setRerolling(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await onSave({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      nickname: nickname.trim() || null,
      career: careerValueFromChoice(career),
      currentSubject: currentSubject.trim() || null,
      bio: bio.trim() || null,
      instagram: instagram.trim() || null,
      studentNumber: studentNumber.trim() || null,
      identityMode,
    });
    if (ok) setSavedAt(Date.now());
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} className={inputClass} />
        </Field>
        <Field label="Apellido">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} className={inputClass} />
        </Field>
        <Field label="Apodo">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Carrera">
            <CareerSelect id="profile-career" value={career} onChange={setCareer} className={inputClass} />
          </Field>
        </div>
        <Field label="Materia actual">
          <input value={currentSubject} onChange={(e) => setCurrentSubject(e.target.value)} maxLength={80} className={inputClass} />
        </Field>
        <Field label="Legajo">
          <input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} maxLength={20} className={inputClass} />
        </Field>
        <Field label="Instagram (sin @)">
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={30} className={inputClass} />
        </Field>
      </div>

      <Field label="Bio">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} className={inputClass} />
        <p className="mt-1 text-xs text-muted">{bio.length}/280</p>
      </Field>

      <Field label="¿Cómo te ven otras personas?">
        <select value={identityMode} onChange={(e) => setIdentityMode(e.target.value as MyProfileDto["identityMode"])} className={inputClass}>
          {IDENTITY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {identityModeLabel(mode)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{identityModeHint(identityMode)}</p>
      </Field>

      {offerRoomVisibility ? (
        <div className="flex flex-col gap-2 rounded-lg border border-app bg-[var(--surface-2)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-main">
            Todavía no aparecés en la sala con este nombre. ¿Querés que te vean como “{shownName}” en “Personas en la sala” y en tu lugar?
          </span>
          <button
            type="button"
            onClick={() => void onShowMeInRoom()}
            disabled={saving}
            className="min-h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Sí, mostrarme
          </button>
        </div>
      ) : null}

      {identityMode === "HIDDEN" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-app bg-surface px-3 py-2">
          <span className="text-sm text-main">
            Te ven como: <span className="font-semibold">{profile.alias ?? "Usuario anónimo"}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleReroll()}
            disabled={rerolling}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-app px-3 text-xs font-semibold text-main disabled:opacity-50"
          >
            <ShuffleIcon size={14} aria-hidden="true" />
            Otro nombre
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Guardar
        </button>
        {savedAt ? <span className="text-sm text-[var(--seat-free)]">Guardado.</span> : null}
      </div>
    </form>
  );
}

const inputClass = "w-full rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-main">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
