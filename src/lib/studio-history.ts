import type { ComponentProps } from "react";

export interface StudioChartData {
  title: string;
  description?: string;
  chartType: "bar" | "line" | "pie" | "area";
  xKey: string;
  series: { name: string; dataKey: string }[];
  data: Record<string, string | number>[];
  insight: string;
  citations?: string[];
}
export interface StudioTableData {
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
  insight: string;
  citations?: string[];
}
export interface StudioSessionItem {
  id: string;
  mode: "image" | "comic" | "chart" | "table";
  prompt: string;
  imageUrl?: string;
  chart?: StudioChartData;
  table?: StudioTableData;
}
export interface StudioThemeState {
  themeId: string;
  customPalette: string;
  customFont: string;
  customVibe: string;
}
export interface SavedStudioSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: StudioSessionItem[];
  theme: StudioThemeState;
  lastPrompt?: string;
  lastMode?: StudioSessionItem["mode"];
}

const KEY = "smartquiz-studio-history";

export function listStudioSessions(): SavedStudioSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedStudioSession[]) : [];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveStudioSession(s: Omit<SavedStudioSession, "id" | "createdAt" | "updatedAt"> & { id?: string }): SavedStudioSession {
  const all = listStudioSessions();
  const now = Date.now();
  if (s.id) {
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      const updated: SavedStudioSession = { ...all[idx], ...s, id: all[idx].id, createdAt: all[idx].createdAt, updatedAt: now };
      all[idx] = updated;
      localStorage.setItem(KEY, JSON.stringify(all));
      return updated;
    }
  }
  const created: SavedStudioSession = {
    id: Math.random().toString(36).slice(2),
    name: s.name,
    items: s.items,
    theme: s.theme,
    lastPrompt: s.lastPrompt,
    lastMode: s.lastMode,
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(KEY, JSON.stringify([created, ...all]));
  return created;
}

export function deleteStudioSession(id: string) {
  const all = listStudioSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getStudioSession(id: string): SavedStudioSession | undefined {
  return listStudioSessions().find((s) => s.id === id);
}

export type _Unused = ComponentProps<"div">;
