export type SourceKind = "text" | "url" | "image" | "video" | "document" | "video-file" | "websearch";

export interface QuizSource {
  id: string;
  kind: SourceKind;
  label: string;
  content?: string;
  dataUrl?: string;
  // For local video files: base64 data URL + mime + size
  mimeType?: string;
  sizeBytes?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

export interface QuizAnswer {
  questionIndex: number;
  selectedIndex: number;
  correct: boolean;
}

export interface QuizSession {
  quiz: Quiz;
  answers: QuizAnswer[];
}