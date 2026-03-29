// KOL 領域模型

export type ValidationStatus = 'pending' | 'validating' | 'active' | 'rejected';

export interface ValidationScore {
  totalPosts: number;
  postsWithTickers: number;
  coverageRate: number;
  postsWithSentiment: number;
  directionalityRate: number;
  totalArguments: number;
  avgArgumentsPerPost: number;
  passed: boolean;
  failedCriteria: string[];
}

export interface KOL {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: SocialLinks;
  validationStatus: ValidationStatus;
  validationScore: ValidationScore | null;
  validatedAt: Date | null;
  validatedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialLinks {
  twitter?: string;
  facebook?: string;
  youtube?: string;
  instagram?: string;
  website?: string;
}

export interface KOLWithStats extends KOL {
  postCount: number;
  returnRate: number | null;
  lastPostAt: Date | null;
}

export interface CreateKOLInput {
  name: string;
  avatarUrl?: string;
  bio?: string;
  socialLinks?: SocialLinks;
}

export interface UpdateKOLInput {
  name?: string;
  avatarUrl?: string;
  bio?: string;
  socialLinks?: SocialLinks;
}

// KOL 搜尋結果
export interface KOLSearchResult {
  id: string;
  name: string;
  avatarUrl: string | null;
}
