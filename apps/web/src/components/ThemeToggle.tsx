"use client";

import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";

/** Cycles light -> dark -> system. Small icon button, safe to render in the header on any breakpoint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to localStorage, unavailable during SSR/first render
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    const next: ThemePreference = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    setStoredTheme(next);
  }

  const label = theme === "dark" ? "Oscuro" : theme === "light" ? "Claro" : "Automático";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label="Cambiar tema"
      title={`Tema: ${label}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-app text-main hover:bg-[var(--surface-2)]"
    >
      {theme === "dark" ? (
        <MoonIcon aria-hidden="true" size={20} weight="regular" />
      ) : theme === "light" ? (
        <SunIcon aria-hidden="true" size={20} weight="regular" />
      ) : (
        <DesktopIcon aria-hidden="true" size={20} weight="regular" />
      )}
    </button>
  );
}
