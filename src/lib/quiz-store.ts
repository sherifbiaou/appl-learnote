import type { QuizSession } from "./quiz-types";

const KEY = "appquiz-current-session";

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