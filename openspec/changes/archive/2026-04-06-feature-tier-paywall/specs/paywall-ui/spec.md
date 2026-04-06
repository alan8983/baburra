## ADDED Requirements

### Requirement: Blur gate renders preview items and blurs remainder
The `BlurGate` component SHALL render children up to `previewLimit` normally, apply a CSS blur (4px) + gradient overlay on remaining children, and display an upgrade CTA at the bottom. If the user has sufficient tier, all children SHALL render normally with no overlay.

#### Scenario: Free user sees blurred argument cards
- **WHEN** a free user views a post detail with 5 argument cards wrapped in `BlurGate` with feature `argument_cards`
- **THEN** the first 2 argument cards SHALL render normally, the remaining 3 SHALL be blurred with a gradient overlay, and an upgrade CTA SHALL appear

#### Scenario: Pro user sees all argument cards
- **WHEN** a pro user views the same post detail
- **THEN** all 5 argument cards SHALL render normally with no blur, gradient, or CTA

#### Scenario: Blur gate CTA triggers upgrade prompt
- **WHEN** a free user clicks the upgrade CTA button in the blur gate
- **THEN** the upgrade prompt modal SHALL open

### Requirement: Pro badge indicates locked features
The `ProBadge` component SHALL display a pill-shaped badge with lock icon and "Pro" text. It SHALL be hidden when the user has sufficient tier.

#### Scenario: Free user sees pro badge on KOL comparison button
- **WHEN** a free user views a KOL detail page with a "Compare" button containing `ProBadge`
- **THEN** a pill badge with "Pro" text SHALL be visible inline with the button text

#### Scenario: Pro user does not see pro badge
- **WHEN** a pro user views the same button
- **THEN** the badge SHALL not be rendered

#### Scenario: Free user clicks pro-badge-gated action
- **WHEN** a free user clicks a button gated with a pro badge
- **THEN** the original action SHALL be intercepted and the upgrade prompt modal SHALL open instead

### Requirement: Tracking limit intercept shows swap dialog at capacity
The `TrackingLimitGate` component SHALL display a dialog when a user at their KOL tracking limit attempts to subscribe to another KOL. The dialog SHALL show current tracked KOLs with count, and offer upgrade or swap options.

#### Scenario: Free user at limit tries to subscribe
- **WHEN** a free user tracking 5/5 KOLs clicks subscribe on a new KOL
- **THEN** a dialog SHALL appear showing "5/5" progress, a list of currently tracked KOLs with unsubscribe buttons, an upgrade CTA, and a dismiss button

#### Scenario: User swaps a tracked KOL
- **WHEN** the user unsubscribes from one KOL in the tracking limit dialog
- **THEN** the count SHALL update to "4/5" and the user MAY retry subscribing to the new KOL

#### Scenario: User dismisses dialog
- **WHEN** the user dismisses the tracking limit dialog
- **THEN** the dialog SHALL close with no side effects

### Requirement: Upgrade prompt modal shows tier comparison
The `UpgradePrompt` component SHALL display a dismissible modal showing the user's current tier, the recommended upgrade tier, 3-4 key feature differences, and a CTA button linking to the pricing page.

#### Scenario: Free user sees upgrade to Pro prompt
- **WHEN** the upgrade prompt opens for a free user with recommended tier Pro
- **THEN** the modal SHALL show current tier "Free", target tier "Pro", feature comparison bullets, and a CTA button

#### Scenario: User dismisses upgrade prompt
- **WHEN** the user clicks outside the modal or the close button
- **THEN** the modal SHALL close without navigation

### Requirement: All paywall text supports zh-TW and en
All paywall UI components SHALL use i18n translation keys from `paywall.json` message files. Both `zh-TW` and `en` locales SHALL have complete translations.

#### Scenario: Chinese locale user sees Chinese paywall text
- **WHEN** a user with locale `zh-TW` sees a blur gate CTA
- **THEN** the CTA text SHALL read "升級 Pro"

#### Scenario: English locale user sees English paywall text
- **WHEN** a user with locale `en` sees a blur gate CTA
- **THEN** the CTA text SHALL read "Upgrade to Pro"

### Requirement: Blur gate applied to post detail argument section
The post detail argument cards section SHALL be wrapped in a `BlurGate` with feature `argument_cards`, showing the first 2 cards to free users and blurring the rest.

#### Scenario: Post detail shows gated arguments
- **WHEN** a free user opens a post detail page with AI argument cards
- **THEN** the argument section SHALL use blur gate with 2 visible cards

### Requirement: Blur gate applied to KOL stats tab win rate breakdown
The KOL detail stats tab win rate breakdown (per-stock, per-period rows) SHALL be wrapped in a `BlurGate` with feature `win_rate_breakdown`, showing summary to free users and blurring detailed rows.

#### Scenario: KOL stats shows gated win rate detail
- **WHEN** a free user views a KOL's stats tab
- **THEN** the overall win rate number SHALL be visible, but per-stock and per-period breakdown rows SHALL be blurred

### Requirement: Tracking limit intercept applied to KOL subscribe action
The KOL subscribe action SHALL check the user's current subscription count against their tier limit before calling the API. If at capacity, the tracking limit dialog SHALL appear.

#### Scenario: Subscribe at capacity shows dialog
- **WHEN** a free user tracking 5 KOLs clicks subscribe on a 6th KOL
- **THEN** the tracking limit dialog SHALL appear instead of calling the subscribe API
