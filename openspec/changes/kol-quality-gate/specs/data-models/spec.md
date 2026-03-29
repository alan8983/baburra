## MODIFIED Requirements

### Requirement: KOL table schema
The `kols` table SHALL include the following additional columns for validation tracking:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `validation_status` | `TEXT NOT NULL` | `'pending'` | One of: `pending`, `validating`, `active`, `rejected` |
| `validation_score` | `JSONB` | `NULL` | Detailed scoring breakdown from qualification check |
| `validated_at` | `TIMESTAMPTZ` | `NULL` | Timestamp when validation completed |
| `validated_by` | `UUID REFERENCES auth.users(id)` | `NULL` | User who nominated this KOL for validation |

An index SHALL be created: `CREATE INDEX idx_kols_validation ON kols(validation_status)`.

Existing KOL rows SHALL be migrated to `validation_status = 'active'` (they were manually curated).

#### Scenario: New KOL created with pending status
- **WHEN** a KOL is created via nomination
- **THEN** `validation_status` defaults to `'pending'`, other validation fields are NULL

#### Scenario: Existing KOLs migrated to active
- **WHEN** the migration runs
- **THEN** all pre-existing KOL rows have `validation_status = 'active'`

#### Scenario: Validation score stored as JSONB
- **WHEN** a KOL completes validation
- **THEN** `validation_score` contains `{ totalPosts, postsWithTickers, coverageRate, postsWithSentiment, directionalityRate, totalArguments, avgArgumentsPerPost, passed, failedCriteria[] }`

### Requirement: Post-stocks source tracking
The `post_stocks` table SHALL include the following additional columns:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | `TEXT NOT NULL` | `'explicit'` | `'explicit'` or `'inferred'` — how the ticker was identified |
| `inference_reason` | `TEXT` | `NULL` | Human-readable reason for inference (only when source = 'inferred') |

Existing `post_stocks` rows SHALL be migrated to `source = 'explicit'`.

#### Scenario: Explicit post-stock link created
- **WHEN** a post is created with an explicitly mentioned ticker
- **THEN** the `post_stocks` row has `source = 'explicit'` and `inference_reason = NULL`

#### Scenario: Inferred post-stock link created
- **WHEN** a post is created with an AI-inferred ticker
- **THEN** the `post_stocks` row has `source = 'inferred'` and `inference_reason` contains the explanation

#### Scenario: Existing post-stocks default to explicit
- **WHEN** the migration runs
- **THEN** all pre-existing `post_stocks` rows have `source = 'explicit'`

### Requirement: Scrape jobs job_type extension
The `scrape_jobs.job_type` column SHALL accept the value `'validation_scrape'` in addition to existing values (`'initial_scrape'`, `'incremental_check'`).

#### Scenario: Validation scrape job created
- **WHEN** a validation scrape job is created
- **THEN** `job_type = 'validation_scrape'` is stored successfully

### Requirement: KOL domain model extension
The `KOL` TypeScript interface SHALL include the following additional fields:

```ts
validationStatus: 'pending' | 'validating' | 'active' | 'rejected';
validationScore: ValidationScore | null;
validatedAt: Date | null;
validatedBy: string | null;
```

The `PostStockLink` TypeScript interface SHALL include:
```ts
source: 'explicit' | 'inferred';
inferenceReason: string | null;
```

#### Scenario: KOL domain model maps validation fields
- **WHEN** a KOL row is fetched from the database
- **THEN** the repository maps `validation_status` → `validationStatus`, `validation_score` → `validationScore`, etc.

#### Scenario: PostStockLink includes source tracking
- **WHEN** a post-stock link is fetched
- **THEN** the domain model includes `source` and `inferenceReason` fields
