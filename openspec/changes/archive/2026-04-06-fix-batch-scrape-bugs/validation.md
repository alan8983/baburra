# Validation: Fix Batch Scrape Bugs

Pre-requisites: dev server running (`npm run dev`), `.env.local` configured with valid `DEV_USER_ID`, `YOUTUBE_DATA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## TC-1: FK constraint fix — scrape job creation succeeds (Bug #2, CRITICAL)

**Type**: API + DB round-trip
**Endpoint**: `POST /api/scrape/profile`
**Body**:
```json
{
  "profileUrl": "https://www.youtube.com/@MeetKevin"
}
```
**Expected**:
- Response status: `200`
- Response body contains `jobId` (UUID), `kolId`, `kolName`, `status: "queued"`
- DB: `SELECT triggered_by FROM scrape_jobs WHERE id = '<jobId>'` returns `DEV_USER_ID` value
- DB: FK constraint on `scrape_jobs.triggered_by` now references `profiles(id)`, not `auth.users(id)`

**Verify FK target**:
```sql
SELECT ccu.table_name AS referenced_table
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'scrape_jobs'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.column_name = 'id'
  AND tc.constraint_name LIKE '%triggered_by%';
```
- Must return `referenced_table = 'profiles'`

**Criticality**: BLOCKER — if this fails, TC-3 and TC-4 cannot run.

---

## TC-2: YouTube discovery returns duration data (Bug #1, HIGH)

**Type**: API call
**Endpoint**: `POST /api/scrape/discover`
**Body**:
```json
{
  "profileUrl": "https://www.youtube.com/@MoneyXYZ"
}
```
**Expected**:
- Response status: `200`
- `discoveredUrls` array has ≥40 items
- At least 50% of items have `durationSeconds` as a number (not `null`/`undefined`)
- Items without duration should still have `contentType` set (defaults to `long_video`)
- Console/server logs contain warnings for any video IDs that the API didn't return details for

**Pass criteria**: `(items with durationSeconds / total items) >= 0.50`
**Previous baseline**: 28% had duration (14/50). Fix should not regress this — improvement depends on video availability.

---

## TC-3: Error field reaches frontend (Bug #5, MEDIUM)

**Type**: API response shape check
**Endpoint**: `GET /api/scrape/jobs/<jobId>` (use jobId from TC-1)
**Expected**:
- Response body contains field `errorMessage` (not `error`)
- If job status is `failed`: `errorMessage` is a non-empty string
- Frontend `ScrapeJob` type in `src/hooks/use-scrape.ts` uses `errorMessage?: string` (not `error`)
- UI component `src/components/scrape/scrape-progress.tsx` references `job.errorMessage` (not `job.error`)

**Static check** (no server needed):
```bash
grep -n 'job\.error[^MC]' src/components/scrape/scrape-progress.tsx
```
- Must return 0 matches (no references to `job.error` without `Message` suffix)

```bash
grep -n 'errorMessage' src/hooks/use-scrape.ts
```
- Must return ≥1 match in the `ScrapeJob` interface

---

## TC-4: Full batch scrape end-to-end (Integration)

**Type**: End-to-end API flow
**Pre-requisite**: TC-1 passes

**Steps**:
1. `POST /api/scrape/discover` with `"profileUrl": "https://www.youtube.com/@MeetKevin"`
   - Expect: `200`, `discoveredUrls` with ~8 items
2. `POST /api/scrape/profile` with `"profileUrl": "https://www.youtube.com/@MeetKevin"`
   - Expect: `200`, response has `jobId`, `status: "queued"`, `totalUrls >= 1`
3. `POST /api/scrape/jobs/<jobId>/continue`
   - Expect: `200`, response has `processedUrls > 0`
4. `GET /api/scrape/jobs/<jobId>`
   - Expect: `200`, `status` is `"processing"` or `"completed"`, `processedUrls >= 1`
5. Repeat step 3-4 until `status === "completed"` or 10 iterations
6. Final `GET /api/scrape/jobs/<jobId>`
   - Expect: `status: "completed"`, `importedCount >= 1`, `processedUrls === totalUrls`

**Pass criteria**: Job reaches `completed` status within 10 continue cycles.

---

## TC-5: initialProgress.totalUrls uses selected count (Bug #8, MEDIUM)

**Type**: API response check
**Endpoint**: `POST /api/scrape/profile`
**Body**:
```json
{
  "profileUrl": "https://www.youtube.com/@MeetKevin",
  "selectedUrls": ["https://www.youtube.com/watch?v=VIDEO_ID_1", "https://www.youtube.com/watch?v=VIDEO_ID_2"]
}
```
_(Replace VIDEO_ID_1, VIDEO_ID_2 with real IDs from TC-2's discoveredUrls)_

**Expected**:
- Response `totalUrls` equals `2` (number of selected URLs), NOT the total discovered count
- Response `initialProgress.totalUrls` equals `2`

---

## TC-6: Dead code removed (Bugs #6/#7, LOW)

**Type**: Static check (no server needed)

```bash
grep -n 'url: string' src/hooks/use-scrape.ts
```
- Must NOT match inside the `ScrapeJob` interface (may match in `ScrapeJobInput`)

```bash
grep -n 'stats?' src/hooks/use-scrape.ts
```
- Must return 0 matches

```bash
grep -n 'job\.stats' src/hooks/use-scrape.ts src/components/scrape/scrape-progress.tsx
```
- Must return 0 matches

---

## TC-7: Type check and unit tests pass

**Type**: Build verification
```bash
npm run type-check
npm test
```
**Expected**: Both exit with code 0, no new errors or test failures.
