# Scope and Limitations

This document describes the project's intentional design boundaries, its current limitations, and the additional engineering that a shared production service would require. The possible extensions below are options, not committed work.

## Current scope

### Supported reasoning domain

The engine supports four deterministic scenario categories:

1. Component unavailability.
2. Component latency degradation.
3. Incoming-load multiplication.
4. Asynchronous circuit-breaker state change.

Questions outside these categories return `NOT_ANSWERABLE`. Additional scenario types would need validated schemas and deterministic handlers.

### Interpretation and computation

Microsoft Foundry converts natural-language architecture descriptions and questions into structured architecture and scenario data. It does not calculate capacity, utilization, retry amplification, timeout impact, cost, or blast radius. Application code performs quantitative calculations so that results can be reproduced, tested, and audited.

The current model uses steady-state formulas and deterministic graph traversal for architectures of up to 15 components. Circuit-breaker analysis evaluates explicitly requested `open`, `half_open`, and `closed` states as snapshots.

### Local model versions and credentials

Architecture models are stored in a local JSON repository with immutable versions. This preserves the relationship between a model version and its analyses. Microsoft Foundry credentials are supplied at runtime through environment variables using `.env.example` as the configuration template; they are not stored in source control or embedded in the container image.

## Known limitations

These are intentional boundaries of the current reasoning model:

- It does not model queue depth or queueing theory, probabilistic traffic distributions, Monte Carlo or discrete-event simulation, regional failover, or geographic topology.
- It does not simulate recovery over time beyond explicit circuit-breaker state snapshots.
- Declared availability percentages are architectural targets, not observed availability measurements. Measuring actual availability would require outage durations, observation windows, fallback behavior, and measured request impact.
- The web interface does not provide version deletion or renaming. Stored versions remain immutable.

Queueing, dynamic traffic, recovery timelines, and regional behavior would require an extended formal model and separate simulation strategies.

## Production hardening requirements

The local JSON repository is suited to the current single-instance design. A distributed deployment would need durable database storage, transactions, concurrency control, retention policies, backups, and schema migrations.

Authentication, authorization, tenant isolation, role-based access control, and user-specific model ownership are outside the current runtime. These controls are needed before operating it as a shared multi-user platform.

## Possible future evolution

Depending on the requirements of a larger deployment, further engineering could include:

- Centralized metrics and distributed tracing.
- Request rate limiting and quotas.
- Circuit breakers and controlled retries for external AI calls.
- Managed secret storage and automated key rotation.
- CI/CD and automated security scanning.
- Durable cloud storage and multiple application replicas.

The current design keeps its central boundary explicit: **AI interprets; deterministic code validates and calculates.**
