// Draft 領域模型

import type { Sentiment } from './post';

export interface Draft {
  id: string;
  userId: string;
  kolId: string | null;
  kolNameInput: string | null;
  content: string | null;
  sourceUrl: string | null;
  images: string[];
  sentiment: Sentiment | null;
  postedAt: Date | null;
  stockIds: string[];
  stockNameInputs: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftWithRelations extends Draft {
  kol: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
  stocks: {
    id: string;
    ticker: string;
    name: string;
  }[];
}

export interface CreateDraftInput {
  kolId?: string;
  kolNameInput?: string;
  content?: string;
  sourceUrl?: string;
  images?: string[];
  sentiment?: Sentiment;
  postedAt?: Date;
  stockIds?: string[];
  stockNameInputs?: string[];
}

export interface UpdateDraftInput {
  kolId?: string | null;
  kolNameInput?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
  images?: string[];
  sentiment?: Sentiment | null;
  postedAt?: Date | null;
  stockIds?: string[];
  stockNameInputs?: string[];
}
