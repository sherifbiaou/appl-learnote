import type { Quiz, QuizQuestion } from "./quiz-types";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffle each question's options so the correct answer is uniformly
 * distributed across A/B/C/D — Gemini has a strong bias toward middle
 * indices (B/C) that we neutralize client-side.
 */
export function shuffleQuizOptions(quiz: Quiz): Quiz {
  const questions: QuizQuestion[] = quiz.questions.map((q) => {
    const indexed = q.options.map((opt, i) => ({ opt, i }));
    const shuffled = shuffle(indexed);
    const newOptions = shuffled.map((x) => x.opt);
    const newCorrect = shuffled.findIndex((x) => x.i === q.correctIndex);
    return {
      ...q,
      options: newOptions,
      correctIndex: newCorrect >= 0 ? newCorrect : q.correctIndex,
    };
  });
  return { ...quiz, questions };
}