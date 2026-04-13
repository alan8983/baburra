## MODIFIED Requirements

### Requirement: Gemini model fallback chain
The `withModelFallback` function SHALL try each model in the configured chain with each available API key before considering the chain exhausted. The callback signature SHALL be `(model: string, apiKey: string) => Promise<T>` to support key pool rotation. On full-chain quota exhaustion, the function SHALL apply exponential backoff retries as defined by the gemini-resilience capability.

#### Scenario: Model fallback with multiple keys
- **WHEN** model A returns 429 with key1
- **THEN** model A is retried with key2 before falling back to model B

#### Scenario: Quota error triggers backoff after full matrix
- **WHEN** all models × all keys return 429
- **THEN** the client waits 2s and retries the full matrix before trying 6s and 18s delays
