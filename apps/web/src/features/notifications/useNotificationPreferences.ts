"use client";

import type { NotificationPreferencesDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-store";

export type NotificationPreferencesPatch = Partial<NotificationPreferencesDto>;

/** Loads/saves the caller's notification preferences (`GET`/`PUT /api/v1/notifications/preferences`). */
export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferencesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { me } = useMe();
  const signedIn = Boolean(me?.user);

  const load = useCallback(async () => {
    try {
      setPreferences(await apiFetch<NotificationPreferencesDto>("/api/v1/notifications/preferences"));
    } catch {
      // Best-effort: the settings UI just stays in its "not loaded" state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Preferences are per-account; anonymous visitors would only get a 401.
    if (!signedIn) return;
    void load();
  }, [load, signedIn]);

  async function update(patch: NotificationPreferencesPatch) {
    setPreferences((prev) => (prev ? { ...prev, ...patch } : prev)); // optimistic
    setSaving(true);
    try {
      setPreferences(await apiFetch<NotificationPreferencesDto>("/api/v1/notifications/preferences", { method: "PUT", body: JSON.stringify(patch) }));
    } finally {
      setSaving(false);
    }
  }

  return { preferences, loading, saving, update };
}
