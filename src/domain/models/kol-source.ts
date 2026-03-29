// KOL Source, Subscription & Scrape Job domain models

export interface KolSource {
  id: string;
  kolId: string;
  platform: string;
  platformId: string;
  platformUrl: string;
  scrapeStatus: string;
  lastScrapedAt: Date | null;
  postsScrapedCount: number;
  monitoringEnabled: boolean;
  monitorFrequencyHours: number;
  nextCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KolSubscription {
  id: string;
  userId: string;
  kolSourceId: string;
  notifyNewPosts: boolean;
  createdAt: Date;
}

export type ScrapeJobType = 'initial_scrape' | 'incremental_check' | 'validation_scrape';
export type ScrapeJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'permanently_failed';

export interface ScrapeJob {
  id: string;
  kolSourceId: string;
  jobType: ScrapeJobType;
  status: ScrapeJobStatus;
  triggeredBy: string | null;
  totalUrls: number;
  processedUrls: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  filteredCount: number;
  discoveredUrls: string[];
  retryCount: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined from kol_sources → kols (populated in getScrapeJobsByUser)
  kolId?: string;
  kolName?: string;
}
