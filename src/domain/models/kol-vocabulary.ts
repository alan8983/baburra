export interface KolVocabularyTerm {
  id: string;
  kolId: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  category: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKolVocabularyInput {
  kolId: string;
  pattern: string;
  replacement: string;
  isRegex?: boolean;
  category?: string;
  note?: string;
}
