# Middleman Design Notes for use-harness

Borrowed practices:

- One user-facing manager; backend workers are internal.
- Structured assignments include objective, constraints, deliverable, and validation.
- Backends should expose capabilities and lifecycle state.
- Internal events/logs are separate from final user-visible summaries.
- Readiness/auth errors should be structured and actionable.
- Verification evidence belongs in completion reports.

Rejected practices:

- No daemon/dashboard until CLI usage proves it is necessary.
- No default unrestricted execution.
- No prompt-only safety for destructive operations.
- No long-lived workers by default.
- No worker direct-to-user output.