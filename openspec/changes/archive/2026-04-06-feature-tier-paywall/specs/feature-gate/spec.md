## ADDED Requirements

### Requirement: Tier constants define limits per subscription tier
The system SHALL provide a `TIER_LIMITS` constant with KOL tracking limits and weekly credits for each tier: free (5 KOLs, 850 credits), pro (30 KOLs, 4200 credits), max (100 KOLs, 21000 credits).

#### Scenario: Free tier limits
- **WHEN** the system reads `TIER_LIMITS.free`
- **THEN** it SHALL return `{ kolTracking: 5, weeklyCredits: 850 }`

#### Scenario: Pro tier limits
- **WHEN** the system reads `TIER_LIMITS.pro`
- **THEN** it SHALL return `{ kolTracking: 30, weeklyCredits: 4200 }`

#### Scenario: Max tier limits
- **WHEN** the system reads `TIER_LIMITS.max`
- **THEN** it SHALL return `{ kolTracking: 100, weeklyCredits: 21000 }`

### Requirement: Feature gate service returns access level per feature and tier
The system SHALL provide a `getFeatureAccess(feature, userTier)` function that returns a `FeatureAccess` object containing `gate` (full_access | blur_gate | pro_badge | locked), optional `previewLimit`, and `requiredTier`.

#### Scenario: Free user accessing argument cards
- **WHEN** `getFeatureAccess('argument_cards', 'free')` is called
- **THEN** it SHALL return `{ gate: 'blur_gate', previewLimit: 2, requiredTier: 'pro' }`

#### Scenario: Pro user accessing argument cards
- **WHEN** `getFeatureAccess('argument_cards', 'pro')` is called
- **THEN** it SHALL return `{ gate: 'full_access' }`

#### Scenario: Free user accessing win rate breakdown
- **WHEN** `getFeatureAccess('win_rate_breakdown', 'free')` is called
- **THEN** it SHALL return `{ gate: 'blur_gate', previewLimit: 1, requiredTier: 'pro' }`

#### Scenario: Free user accessing KOL comparison
- **WHEN** `getFeatureAccess('kol_comparison', 'free')` is called
- **THEN** it SHALL return `{ gate: 'pro_badge', requiredTier: 'pro' }`

#### Scenario: Free user accessing argument timeline
- **WHEN** `getFeatureAccess('argument_timeline', 'free')` is called
- **THEN** it SHALL return `{ gate: 'pro_badge', requiredTier: 'pro' }`

#### Scenario: Free user accessing CSV export
- **WHEN** `getFeatureAccess('csv_export', 'free')` is called
- **THEN** it SHALL return `{ gate: 'pro_badge', requiredTier: 'pro' }`

#### Scenario: Free user accessing API access
- **WHEN** `getFeatureAccess('api_access', 'free')` is called
- **THEN** it SHALL return `{ gate: 'locked', requiredTier: 'max' }`

#### Scenario: Pro user accessing API access
- **WHEN** `getFeatureAccess('api_access', 'pro')` is called
- **THEN** it SHALL return `{ gate: 'locked', requiredTier: 'max' }`

#### Scenario: Max user accessing any feature
- **WHEN** `getFeatureAccess(anyFeature, 'max')` is called
- **THEN** it SHALL return `{ gate: 'full_access' }`

### Requirement: React hook provides feature gate state to components
The system SHALL provide a `useFeatureGate(feature)` hook that returns `{ access, canAccess, isBlurred, isLocked, previewLimit, requiredTier }` by reading the user's tier from the existing profile query.

#### Scenario: Hook returns blurred state for free user
- **WHEN** a free user's component calls `useFeatureGate('argument_cards')`
- **THEN** the hook SHALL return `{ canAccess: false, isBlurred: true, isLocked: false, previewLimit: 2, requiredTier: 'pro' }`

#### Scenario: Hook returns full access for pro user
- **WHEN** a pro user's component calls `useFeatureGate('argument_cards')`
- **THEN** the hook SHALL return `{ canAccess: true, isBlurred: false, isLocked: false, previewLimit: null, requiredTier: 'pro' }`

#### Scenario: Hook returns locked state for pro badge features
- **WHEN** a free user's component calls `useFeatureGate('kol_comparison')`
- **THEN** the hook SHALL return `{ canAccess: false, isBlurred: false, isLocked: true, previewLimit: null, requiredTier: 'pro' }`
