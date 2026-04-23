import type { QuizSession } from "./quiz-types";
import type { QuizSource } from "./quiz-types";

const KEY = "appquiz-current-session";
const SOURCES_KEY = "appquiz-current-sources";

export function saveSession(s: QuizSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function loadSession(): QuizSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuizSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

// Persist the raw user sources so other pages (Summary, Formulas, Exam)
// can reuse them without re-uploading.
export function saveSources(sources: QuizSource[]) {
  try {
    sessionStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
  } catch {}
}

export function loadSources(): QuizSource[] {
  try {
    const raw = sessionStorage.getItem(SOURCES_KEY);
    return raw ? (JSON.parse(raw) as QuizSource[]) : [];
  } catch {
    return [];
  }
}