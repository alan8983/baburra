export interface PaginationParams {
  page?: number;
  limit?: number;
}

interface PaginationResult {
  data?: PaginationParams;
  error?: string;
}

function parseBoundedInt(
  raw: string | null,
  fieldName: 'page' | 'limit',
  min: number,
  max: number
): { value?: number; error?: string } {
  if (!raw) return {};
  const num = Number.parseInt(raw, 10);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return { error: `${fieldName} must be a valid integer` };
  }
  if (num < min || num > max) {
    return { error: `${fieldName} must be between ${min} and ${max}` };
  }
  return { value: num };
}

export interface PaginationOptions {
  /** Hard cap on `?limit=`. Default 100. The KOL detail page passes 1000
   * because it derives the per-stock breakdown from the full post set
   * (R13 in repository-contracts). */
  maxLimit?: number;
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  options: PaginationOptions = {}
): PaginationResult {
  const maxLimit = options.maxLimit ?? 100;
  const pageResult = parseBoundedInt(searchParams.get('page'), 'page', 1, 1000);
  if (pageResult.error) return { error: pageResult.error };

  const limitResult = parseBoundedInt(searchParams.get('limit'), 'limit', 1, maxLimit);
  if (limitResult.error) return { error: limitResult.error };

  return {
    data: {
      page: pageResult.value,
      limit: limitResult.value,
    },
  };
}
