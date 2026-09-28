"use client";

import type { MyProfileDto, PrivacySettingsDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";

/** Mirrors `updateProfileSchema` from `@uns/contracts` (all fields optional/nullable). */
export type ProfilePatch = Partial<Omit<MyProfileDto, "userId" | "email">>;
/** Mirrors `updatePrivacySchema` from `@uns/contracts` (all fields optional). */
export type PrivacyPatch = Partial<PrivacySettingsDto>;

export interface UseMyProfileResult {
  profile: MyProfileDto | null;
  privacy: PrivacySettingsDto | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveProfile: (patch: ProfilePatch) => Promise<boolean>;
  savePrivacy: (patch: PrivacyPatch) => Promise<boolean>;
  /** Updates only the local `avatarUrl` — the avatar endpoints (`/profiles/me/avatar*`) already
   *  persisted it server-side; `updateProfileSchema` can't carry it (https-only, manual URLs only). */
  setLocalAvatarUrl: (avatarUrl: string | null) => void;
  /** Requests a new random alias (only while HIDDEN); returns it on success, `null` on failure. */
  rerollAlias: () => Promise<string | null>;
}

/** Loads and edits the caller's own profile + privacy settings (`/profiles/me`, `/profiles/me/privacy`). */
export function useMyProfile(): UseMyProfileResult {
  const [profile, setProfile] = useState<MyProfileDto | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileDto, privacyDto] = await Promise.all([
        apiFetch<MyProfileDto>("/api/v1/profiles/me"),
        apiFetch<PrivacySettingsDto>("/api/v1/profiles/me/privacy"),
      ]);
      setProfile(profileDto);
      setPrivacy(privacyDto);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "UNAUTHENTICATED" ? "Iniciá sesión para editar tu perfil." : "No pudimos cargar tu perfil.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  const saveProfile = useCallback(async (patch: ProfilePatch) => {
    setSaving(true);
    try {
      const updated = await apiFetch<MyProfileDto>("/api/v1/profiles/me", { method: "PATCH", body: JSON.stringify(patch) });
      setProfile(updated);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const savePrivacy = useCallback(async (patch: PrivacyPatch) => {
    setSaving(true);
    try {
      const updated = await apiFetch<PrivacySettingsDto>("/api/v1/profiles/me/privacy", { method: "PATCH", body: JSON.stringify(patch) });
      setPrivacy(updated);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const setLocalAvatarUrl = useCallback((avatarUrl: string | null) => {
    setProfile((prev) => (prev ? { ...prev, avatarUrl } : prev));
  }, []);

  const rerollAlias = useCallback(async () => {
    setSaving(true);
    try {
      const { alias } = await apiFetch<{ alias: string }>("/api/v1/profiles/me/alias/reroll", { method: "POST" });
      setProfile((prev) => (prev ? { ...prev, alias } : prev));
      return alias;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, privacy, loading, error, saving, saveProfile, savePrivacy, setLocalAvatarUrl, rerollAlias };
}
