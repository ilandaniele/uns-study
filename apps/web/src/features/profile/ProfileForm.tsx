"use client";

import type { MyProfileDto } from "@uns/contracts";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import type { ProfilePatch } from "./useMyProfile";
import { IDENTITY_MODES, identityModeHint, identityModeLabel } from "./identity-mode";

export interface ProfileFormProps {
  profile: MyProfileDto;
  saving: boolean;
  onSave: (patch: ProfilePatch) => Promise<boolean>;
}

/** "Editar perfil" form: name/nickname/career/bio/instagram/legajo + identity-mode selector. */
export function ProfileForm({ profile, saving, onSave }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [career, setCareer] = useState(profile.career ?? "");
  const [currentSubject, setCurrentSubject] = useState(profile.currentSubject ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [instagram, setInstagram] = useState(profile.instagram ?? "");
  const [studentNumber, setStudentNumber] = useState(profile.studentNumber ?? "");
  const [identityMode, setIdentityMode] = useState(profile.identityMode);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await onSave({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      nickname: nickname.trim() || null,
      career: career.trim() || null,
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
        <Field label="Carrera">
          <input value={career} onChange={(e) => setCareer(e.target.value)} maxLength={80} className={inputClass} />
        </Field>
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
        <p className="mt-1 text-xs text-slate-400">{bio.length}/280</p>
      </Field>

      <Field label="¿Cómo te ven otras personas?">
        <select value={identityMode} onChange={(e) => setIdentityMode(e.target.value as MyProfileDto["identityMode"])} className={inputClass}>
          {IDENTITY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {identityModeLabel(mode)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">{identityModeHint(identityMode)}</p>
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Guardar
        </button>
        {savedAt ? <span className="text-sm text-green-700">Guardado.</span> : null}
      </div>
    </form>
  );
}

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
