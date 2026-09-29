"use client";

import type { NotificationPreferencesDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type NotificationPreferencesPatch = Partial<NotificationPreferencesDto>;

/** Loads/saves the caller's notification preferences (`GET`/`PUT /api/v1/notifications/preferences`). */
export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferencesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPreferences(await apiFetch<NotificationPreferencesDto>("/api/v1/notifications/preferences"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
