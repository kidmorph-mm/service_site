export type AppSettings = {
  apiBaseUrl: string;
  jobsDir: string;
  pollIntervalMs: number;
};

const KEY = "kidmorph_settings_v1";
const EVT = "kidmorph:settings";

export const defaultSettings: AppSettings = {
  apiBaseUrl: "http://192.168.0.28:8000",
  jobsDir: "/data/jobs",
  pollIntervalMs: 1500,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVT));
}

import { useEffect, useState } from "react";
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { settings, setSettings };
}