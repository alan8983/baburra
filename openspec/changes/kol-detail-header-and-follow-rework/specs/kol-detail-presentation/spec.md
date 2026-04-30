## ADDED Requirements

### Requirement: Three-row header layout

The KOL detail page (`/kols/[id]`) header (`KolScorecard`) SHALL render its body content as three vertically-stacked rows in this order:

1. **Identity strip** — avatar, name, bio, post-count badge, follower badge (when present), platform-icon link row, and the consolidated KOL-level subscribe button.
2. **Headline metric** — period selector, win-rate ring with sample-size + significance hints, σ-band histogram, and the 4-period returns grid.
3. **Drilldown disclosure** — a collapsible section containing `ScorecardAdvancedMetrics` and the per-stock breakdown chips.

The header SHALL NOT render the avatar/identity column and the analytics column as a horizontal split.

#### Scenario: KOL detail page renders the three rows

- **WHEN** any KOL detail page renders for an existing KOL
- **THEN** the header card body contains three direct child sections in the order Identity strip → Headline metric → Drilldown disclosure
- **AND** Row 1 (Identity strip) renders the avatar, name, bio, post-count badge, follower badge (if applicable), platform-icon links, and the consolidated subscribe button
- **AND** Row 2 (Headline metric) renders the period selector, win-rate ring, σ-band histogram, sample-size text, and 4-period returns grid
- **AND** Row 3 renders the drilldown disclosure trigger

### Requirement: Drilldown disclosure collapsed by default

The Row 3 drilldown SHALL be collapsed by default on a user's first visit. When collapsed, the header SHALL render only the disclosure trigger (chevron + label) and no advanced-metrics body.

#### Scenario: First-time visitor

- **WHEN** a user with no `kols.detail.drilldown.expanded` localStorage entry opens any KOL detail page
- **THEN** the drilldown body is not rendered
- **AND** the disclosure trigger is rendered with a right-pointing chevron and the label `進階分析` (zh-TW) or `Advanced analytics` (en)

### Requirement: Drilldown state persists per device

When the user toggles the drilldown disclosure, the new state SHALL be persisted to `window.localStorage` under the key `kols.detail.drilldown.expanded` with value `'true'` or `'false'`. On subsequent renders of any KOL detail page on the same device, the persisted state SHALL be the initial state.

#### Scenario: User expands drilldown and navigates to a different KOL

- **WHEN** the user clicks the drilldown trigger on KOL A and then navigates to KOL B
- **THEN** KOL B's drilldown is initially expanded
- **AND** `localStorage.getItem('kols.detail.drilldown.expanded')` returns `'true'`

#### Scenario: Invalid localStorage value treated as default

- **WHEN** `localStorage.getItem('kols.detail.drilldown.expanded')` returns a string other than `'true'` (e.g., `'1'`, `'yes'`, `''`, or any garbage)
- **THEN** the drilldown is rendered collapsed (the default)

#### Scenario: localStorage write throws (private mode)

- **WHEN** the user clicks the drilldown trigger in a context where `localStorage.setItem` throws
- **THEN** the in-memory state still updates and the body conditionally renders accordingly
- **AND** no error is shown to the user
- **AND** persistence is silently lost for the session

### Requirement: Single consolidated KOL-level subscribe button

The KOL detail header SHALL render exactly one subscribe button at the KOL level, regardless of how many `kol_sources` the KOL has. The button SHALL NOT render one toggle per source. The button SHALL be hidden when `kol_sources` is empty.

#### Scenario: KOL with two sources renders one button

- **WHEN** a KOL has two `kol_sources` rows (e.g., Gooaye 股癌 with Podcast + YouTube)
- **THEN** the header renders exactly one subscribe button
- **AND** the button label is `追蹤` or `追蹤中` based on the user's combined subscription state

#### Scenario: KOL with no sources renders no button

- **WHEN** a KOL has zero `kol_sources` rows
- **THEN** the subscribe button is not rendered

### Requirement: "Following" indicator gated by full subscription

The subscribe button SHALL display the "following" label (`追蹤中` / `Following`) if and only if the user is subscribed to **every** source of the KOL. If the user is subscribed to some but not all sources (partial state), the button SHALL display the "follow" label (`追蹤` / `Follow`).

#### Scenario: User fully subscribed

- **WHEN** the user is subscribed to all of a KOL's sources
- **THEN** the subscribe button shows `追蹤中` / `Following` with the `secondary` variant

#### Scenario: User partially subscribed

- **WHEN** the user is subscribed to one of a KOL's two sources
- **THEN** the subscribe button shows `追蹤` / `Follow` with the `outline` variant

#### Scenario: User not subscribed

- **WHEN** the user is not subscribed to any of a KOL's sources
- **THEN** the subscribe button shows `追蹤` / `Follow` with the `outline` variant

### Requirement: Subscribe click fans out to all sources

Clicking the subscribe button SHALL initiate parallel subscription mutations for **every source the user is not currently subscribed to**, using the existing `(userId, sourceId)` API. Clicking the button when the user is fully subscribed SHALL initiate parallel **unsubscribe** mutations for every subscribed source.

#### Scenario: Click subscribe on a fully-unsubscribed two-source KOL

- **WHEN** the user clicks `追蹤` on a KOL with two unsubscribed sources
- **THEN** two parallel `POST /api/subscriptions` requests fire, one per `(kolId, sourceId)` pair
- **AND** on success the React Query cache for `subscriptionKeys.kolSources(kolId)` invalidates and the button re-renders as `追蹤中`

#### Scenario: Click subscribe on a partially-subscribed KOL

- **WHEN** the user clicks `追蹤` on a KOL where one of two sources is already subscribed
- **THEN** exactly one `POST /api/subscriptions` request fires (for the unsubscribed source only)
- **AND** the button re-renders as `追蹤中`

#### Scenario: Click unsubscribe on a fully-subscribed KOL

- **WHEN** the user clicks `追蹤中` on a KOL with two subscribed sources
- **THEN** two parallel `DELETE /api/subscriptions/[sourceId]` requests fire
- **AND** on success the button re-renders as `追蹤`

### Requirement: Toast feedback on subscribe action

Every successful click of the subscribe button SHALL trigger a Sonner toast notification. Failed mutations SHALL also trigger a toast with appropriate copy.

#### Scenario: All subscribes succeed

- **WHEN** all parallel subscribe mutations resolve successfully
- **THEN** a `toast.success` fires with copy from the i18n key `subscriptions.toast.followedAll` (zh-TW: `已追蹤所有來源`)

#### Scenario: All unsubscribes succeed

- **WHEN** all parallel unsubscribe mutations resolve successfully
- **THEN** a `toast.success` fires with copy from `subscriptions.toast.unsubscribedAll` (zh-TW: `已取消追蹤`)

#### Scenario: Some mutations fail

- **WHEN** one of two parallel subscribe mutations rejects (e.g., 5xx)
- **THEN** a `toast.error` fires with copy from `subscriptions.toast.followFailed` (zh-TW: `部分追蹤操作失敗`)
- **AND** the button re-renders to reflect the partial state (some sources subscribed)

### Requirement: Tier limit checked before fan-out

When the user clicks `追蹤`, the page SHALL pre-check whether subscribing to all currently-unsubscribed sources of the KOL would exceed `TIER_LIMITS[userTier].kolTracking`. If yes, the existing `TrackingLimitGate` dialog SHALL open and **no** subscribe mutations SHALL fire.

#### Scenario: Free user near tier limit clicks follow on a multi-source KOL

- **WHEN** a Free user has 4 active subscriptions out of a 5-subscription limit and clicks `追蹤` on a 2-source KOL (would push them to 6)
- **THEN** the `TrackingLimitGate` dialog opens
- **AND** zero subscribe requests fire

### Requirement: Platform-icon link row deduplicated against social links

The header Identity row SHALL render a horizontal row of platform-icon links combining `kol_sources[].platformUrl` with `kol.socialLinks` URLs. URLs that appear in both sets SHALL be rendered exactly once. Each rendered URL SHALL be a clickable icon (no text label) that opens the URL in a new tab. Unknown platform values SHALL render the generic `Link` fallback icon.

#### Scenario: Same Twitter URL in both sources and social links

- **WHEN** a KOL has a `kol_sources` row with `platform: 'twitter'`, `platformUrl: 'https://x.com/handle'` and `kol.socialLinks.twitter: 'https://x.com/handle'`
- **THEN** the icon row renders exactly one Twitter icon
- **AND** clicking the icon opens `https://x.com/handle` in a new tab

#### Scenario: Distinct YouTube and Podcast sources

- **WHEN** a KOL has `kol_sources` rows for `platform: 'youtube'` and `platform: 'podcast'` with distinct URLs
- **THEN** the icon row renders both a YouTube icon and a Headphones (podcast) icon
- **AND** each icon links to the respective `platformUrl`

#### Scenario: Unknown platform value

- **WHEN** a `kol_sources` row has `platform: 'unknown_platform'`
- **THEN** the icon row renders the generic Link fallback icon for that entry
- **AND** clicking it opens the row's `platformUrl` in a new tab
