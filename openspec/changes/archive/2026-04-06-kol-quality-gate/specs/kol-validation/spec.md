## ADDED Requirements

### Requirement: KOL validation lifecycle
The system SHALL assign a `validation_status` to every KOL. Valid statuses are: `pending` (just nominated), `validating` (scrape in progress), `active` (passed, visible in pool), `rejected` (failed quality check). Status transitions SHALL follow this state machine:
- `pending` → `validating` (when validation scrape starts)
- `validating` → `active` (when scoring passes)
- `validating` → `rejected` (when scoring fails)
- `rejected` → `active` (admin override only)

#### Scenario: New KOL enters pending status
- **WHEN** a user nominates a new KOL via profile URL submission
- **THEN** the KOL record is created with `validation_status = 'pending'`

#### Scenario: Validation scrape transitions to validating
- **WHEN** the validation scrape job starts processing for a pending KOL
- **THEN** the KOL's `validation_status` is updated to `validating`

#### Scenario: KOL passes validation
- **WHEN** the validation scoring function determines the KOL meets all qualification criteria
- **THEN** the KOL's `validation_status` is set to `active`, `validated_at` is set to current timestamp, and the scraped posts become permanent seed data

#### Scenario: KOL fails validation
- **WHEN** the validation scoring function determines the KOL does NOT meet qualification criteria
- **THEN** the KOL's `validation_status` is set to `rejected`, `validation_score` stores the detailed breakdown, and all posts imported during the validation scrape are deleted

#### Scenario: Admin overrides rejected KOL
- **WHEN** an admin sets a rejected KOL's status to `active`
- **THEN** the KOL enters the public pool with `validation_status = 'active'` and `validated_at` updated

### Requirement: Validation scrape job
The system SHALL support a `validation_scrape` job type in the `scrape_jobs` table. This job type SHALL fetch only the 5-10 most recent posts from the KOL's source, SHALL be quota-exempt (not charged to any user), and SHALL trigger the scoring function upon completion.

#### Scenario: Validation scrape is created on KOL nomination
- **WHEN** a new KOL is created with `validation_status = 'pending'`
- **THEN** a `scrape_job` with `job_type = 'validation_scrape'` is automatically created and queued

#### Scenario: Validation scrape limits post count
- **WHEN** a validation scrape job processes a KOL source
- **THEN** it fetches at most 10 posts (most recent first) and stops

#### Scenario: Validation scrape is quota-exempt
- **WHEN** a validation scrape job runs AI analysis on fetched posts
- **THEN** no AI quota is consumed from any user's account

#### Scenario: Validation scrape triggers scoring on completion
- **WHEN** a validation scrape job completes successfully
- **THEN** the qualification scoring function is invoked with the KOL ID and the imported posts

### Requirement: Qualification scoring criteria
The system SHALL evaluate a KOL against three criteria using the posts imported during validation:
1. **Coverage**: ≥ 60% of sampled posts produce at least one ticker (explicit OR inferred)
2. **Directionality**: ≥ 50% of posts with tickers have at least one non-zero sentiment
3. **Analytical depth**: Average argument count across all sampled posts ≥ 1.5

A KOL SHALL pass validation only if ALL three criteria are met. The detailed scoring breakdown SHALL be stored in `kols.validation_score` as JSONB.

#### Scenario: KOL with high-quality investment content passes
- **WHEN** a macro KOL's 10 sampled posts yield: 7 posts with inferred tickers (70% coverage), 5 of those with non-zero sentiment (71% directionality), and average 2.1 arguments per post
- **THEN** the KOL passes all three criteria and `validation_status` is set to `active`

#### Scenario: KOL with no actionable content fails
- **WHEN** an entertainment KOL's 10 sampled posts yield: 1 post with a ticker (10% coverage)
- **THEN** the KOL fails the coverage criterion and `validation_status` is set to `rejected`

#### Scenario: KOL with opinions but no reasoning fails
- **WHEN** a KOL's sampled posts yield: 80% coverage, 60% directionality, but average 0.8 arguments per post
- **THEN** the KOL fails the analytical depth criterion and `validation_status` is set to `rejected`

#### Scenario: Scoring breakdown stored for audit
- **WHEN** any KOL completes validation (pass or fail)
- **THEN** `kols.validation_score` contains: `{ totalPosts, postsWithTickers, coverageRate, postsWithSentiment, directionalityRate, totalArguments, avgArgumentsPerPost, passed, failedCriteria[] }`

### Requirement: Public pool visibility filtering
The system SHALL only display KOLs with `validation_status = 'active'` in the default KOL list view. Pending and rejected KOLs SHALL be visible only via explicit status filter.

#### Scenario: Default KOL list shows only active KOLs
- **WHEN** a user views the KOL list page without any status filter
- **THEN** only KOLs with `validation_status = 'active'` are displayed

#### Scenario: Status filter reveals non-active KOLs
- **WHEN** a user applies a status filter for `pending` or `rejected`
- **THEN** KOLs with the selected status are displayed

### Requirement: Validation status feedback on scrape page
The system SHALL display the validation status to the user who nominated a KOL, showing progress through the validation lifecycle.

#### Scenario: User sees validation in progress
- **WHEN** a user has nominated a KOL that is currently being validated
- **THEN** the scrape page shows a "驗證中..." status indicator

#### Scenario: User sees validation success
- **WHEN** a nominated KOL passes validation
- **THEN** the scrape page shows "已通過，已加入公共資料庫"

#### Scenario: User sees validation failure with reason
- **WHEN** a nominated KOL fails validation
- **THEN** the scrape page shows "未通過" with a human-readable reason derived from `failedCriteria` (e.g., "近期內容未發現可追蹤的投資觀點")
