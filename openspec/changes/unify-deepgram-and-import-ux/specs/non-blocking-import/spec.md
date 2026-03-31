## ADDED Requirements

### Requirement: Import SHALL NOT block user navigation
The import process SHALL run in the background. Users MUST be able to navigate to any page within the SPA while an import is in progress.

#### Scenario: User navigates during import
- **WHEN** user submits an import batch and then navigates to the KOL list page
- **THEN** the import continues processing and the KOL list page renders normally

#### Scenario: Import form closes on submit
- **WHEN** user clicks "Start Import"
- **THEN** the import form/modal SHALL close immediately and a status toast SHALL appear

### Requirement: Persistent import status toast
The system SHALL display a toast notification showing real-time import status. The toast MUST persist across SPA page navigations.

#### Scenario: Toast shows per-URL status
- **WHEN** an import batch of 3 URLs is in progress
- **THEN** the toast SHALL show each URL with its current status: queued (⏳), processing (🔄), success (✅), or error (❌)

#### Scenario: Toast shows progress bar
- **WHEN** an import batch is in progress
- **THEN** the toast SHALL show a progress indicator reflecting the fraction of URLs completed

#### Scenario: Toast shows time estimate
- **WHEN** an import batch starts
- **THEN** the toast SHALL display the estimated remaining time (e.g., "Est. ~2 min remaining")

#### Scenario: Toast is collapsible
- **WHEN** the user clicks a minimize button on the toast
- **THEN** the toast SHALL collapse to a small badge showing only the progress fraction (e.g., "1/3")

#### Scenario: Toast auto-dismisses after completion
- **WHEN** all URLs in a batch complete (success or error) and results have been shown for 10 seconds
- **THEN** the toast SHALL auto-dismiss unless the user is hovering over it

### Requirement: Import status persists in Zustand store
The import status SHALL be stored in a Zustand store (`useImportStatusStore`) that persists across SPA navigations within the same browser tab session.

#### Scenario: State survives navigation
- **WHEN** an import is in progress and user navigates from /posts to /kols and back
- **THEN** the toast SHALL still show current import status with no data loss

#### Scenario: Multiple concurrent batches
- **WHEN** user submits a second import batch while the first is still running
- **THEN** both batches SHALL be tracked independently in the store and displayed in the toast

### Requirement: Remove full-screen blocking overlay
The `ImportLoadingOverlay` component SHALL be removed and replaced by the non-blocking toast.

#### Scenario: No screen blocking during import
- **WHEN** an import is in progress
- **THEN** no overlay, modal, or z-50 fixed element SHALL block the page content

### Requirement: Import results accessible after completion
The system SHALL provide a way for users to view import results after the toast auto-dismisses.

#### Scenario: Results viewable from toast
- **WHEN** import completes and toast shows results
- **THEN** the toast SHALL include a "View Results" link that navigates to the relevant KOL or posts page
