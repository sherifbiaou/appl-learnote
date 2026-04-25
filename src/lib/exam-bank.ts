import type { QuizSource } from "./quiz-types";

export interface SavedExam {
  id: string;
  name: string;
  totalQ: number;
  totalMin: number;
  startDifficulty: number;
  sources: QuizSource[];
  createdAt: number;
  lastScore?: { score: number; total: number; finalDiff: number; at: number };
}

const KEY = "smartquiz-exam-bank";

export function loadExamBank(): SavedExam[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedExam[]) : [];
  } catch {
    return [];
  }
}

export function saveExamBank(list: SavedExam[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function addExam(exam: SavedExam) {
  const list = loadExamBank();
  list.unshift(exam);
  saveExamBank(list);
}

export function removeExam(id: string) {
  saveExamBank(loadExamBank().filter((e) => e.id !== id));
}

export function updateExam(id: string, patch: Partial<SavedExam>) {
  saveExamBank(loadExamBank().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}
