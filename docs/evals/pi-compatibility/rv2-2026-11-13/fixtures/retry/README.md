# retry-fixture

Dependency-free ES-module retry helper. `retryDelay(attempt, baseMs = 100)`
returns `baseMs * 2 ** attempt` after validating its arguments.
