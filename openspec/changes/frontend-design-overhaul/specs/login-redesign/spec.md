## ADDED Requirements

### Requirement: Login page uses split-panel layout
The login page SHALL use a split-panel layout with a decorative brand panel on the left and the authentication form on the right.

The brand panel SHALL:
- Display the Baburra.io logo and tagline
- Include a decorative background (gradient mesh or abstract chart pattern) that conveys financial sophistication
- Be hidden on mobile viewports (below md breakpoint), showing only the auth form

The auth form panel SHALL:
- Contain the existing authentication controls (email/password, Google OAuth)
- Maintain all current auth functionality unchanged
- Be centered vertically within its panel

#### Scenario: Desktop viewport
- **WHEN** the login page loads on a viewport wider than the md breakpoint (768px)
- **THEN** the page displays a two-column layout with brand panel (left) and auth form (right)

#### Scenario: Mobile viewport
- **WHEN** the login page loads on a viewport narrower than the md breakpoint
- **THEN** the page displays only the auth form panel (full width) with a subtle branded background

### Requirement: Register page matches login visual treatment
The register page SHALL use the same split-panel layout and brand panel as the login page, with the registration form replacing the login form.

#### Scenario: Register page layout
- **WHEN** the register page loads
- **THEN** it displays the same brand panel and layout structure as the login page, with registration-specific form fields

### Requirement: Login page supports dark mode
The login page brand panel and form SHALL adapt to the user's dark mode preference using existing OKLCH color tokens.

#### Scenario: Dark mode active
- **WHEN** the user's system or app preference is dark mode
- **THEN** the login page renders with dark-mode-appropriate colors for both the brand panel and form panel
