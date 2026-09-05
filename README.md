# Architecture Decisions

**Status:** Final case-study implementation

The asynchronous circuit-breaker extension, its deterministic semantics, test
matrix, and copy-ready demonstration are documented in
[`CIRCUIT_BREAKER_EXTENSION.md`](CIRCUIT_BREAKER_EXTENSION.md).

This document records the four principal architectural decisions, their
rationale, rejected alternatives, and accepted consequences.

## Decision 1: Build a constrained reasoning service, not a general architecture chatbot

### Context

The input is written in natural language and may describe different small
software architectures. The engine must produce defensible and testable
results without inventing missing information.

A general-purpose architecture chatbot could answer a broader range of
questions, but its behavior and calculations would be difficult to constrain,
explain, and verify.

### Decision

The service accepts different architecture descriptions that fit the formal
model, but supports only four scenario categories:

1. Component unavailability.
2. Component latency degradation.
3. Incoming-load multiplication.
4. Asynchronous circuit-breaker state change.

Questions outside these categories return an explicit `NOT_ANSWERABLE`
result.

### Rationale

A narrow reasoning domain makes behavior understandable, deterministic,
testable, and appropriate for the delivery scope.

Natural-language input remains flexible, while reasoning capabilities are
deliberately constrained.

### Rejected alternative

A general architecture chatbot was rejected because it would encourage
plausible but unsupported answers and make the boundary between semantic
interpretation and deterministic computation unclear.

### Consequences

- The system processes unseen component names and architecture descriptions.
- It does not attempt to answer every architecture question.
- Unsupported questions are expected refusals, not system failures.
- New scenario types can be added later as separate deterministic handlers.
- An asynchronous circuit breaker can be evaluated as `open`, `half_open`,
  or `closed` without asking the language model to simulate its behavior.

## Decision 2: Use the language model for interpretation, not computation

### Context

Natural-language architecture descriptions and questions are semantically
variable. Fixed string rules alone would not reliably identify services,
dependencies, call types, values, and scenario intent.

However, all calculated quantities must come from inspectable application
code.

### Decision

Microsoft Foundry is used only to translate:

- an architecture description into a formal architecture model;
- a what-if question into a formal scenario.

Deterministic application code then:

- validates the formal model;
- classifies semantic errors, warnings, and missing information;
- decides whether the scenario is answerable;
- propagates dependency effects;
- calculates capacity, retry amplification, utilization, saturation,
  timeout impact, and cost;
- produces the final evidence-backed result.

### Rationale

This establishes a clear safety boundary:

> AI interprets. Code calculates.

### Rejected alternative

Allowing the language model to calculate capacity, saturation, latency,
availability impact, cost, or blast radius was rejected because those outputs
would not be reliably reproducible or independently testable.

### Consequences

- Probabilistic interpretation and deterministic computation are explicit.
- Deterministic tests run without live model calls.
- Semantic extraction and calculation correctness can be evaluated
  separately.
- Missing information produces visible assumptions or an explicit refusal.

## Decision 3: Use closed-form formulas and deterministic graph traversal

### Context

The engine analyzes graphs of no more than 15 components under steady-state
conditions. Supported scenarios involve capacity, retry amplification,
utilization, saturation, timeout thresholds, and dependency impact.

A discrete-event or Monte Carlo simulation would add implementation and
validation complexity that is unnecessary for these scenarios.

### Decision

The engine uses:

- closed-form formulas for capacity, attempts, effective load, utilization,
  saturation, and maximum safe original load;
- deterministic graph traversal for failure propagation and blast-radius
  identification;
- explicit dependency semantics for synchronous, asynchronous, required,
  and optional calls;
- explicit refusal when required values are unavailable.

### Rejected alternative

Monte Carlo and discrete-event simulation were rejected because they would
increase complexity, runtime, and explanation difficulty without improving
the required scenarios.

### Consequences

- Every numeric result can be derived by hand.
- Golden tests can compare exact expected values.
- Results remain deterministic once the formal model and scenario exist.
- The engine assumes steady state.
- It does not model queueing distributions, recovery timelines, or
  time-dependent traffic.

## Decision 4: Use a minimal containerized JavaScript stack with immutable local versioning

### Context

A production platform could use TypeScript, NestJS, Postgres, OpenTelemetry,
and a frontend framework. That complete stack would add complexity unrelated
to the central reasoning problem and make live inspection harder.

The deliverable must also run reproducibly through Docker Compose.

### Decision

The implementation uses:

- Node.js with plain JavaScript;
- Express for the HTTP API;
- Zod for formal schema validation;
- the OpenAI-compatible SDK for Microsoft Foundry;
- plain HTML, CSS, and browser JavaScript;
- local JSON persistence with immutable model versions;
- the built-in Node.js test runner;
- Docker Compose with runtime environment-variable injection;
- a named Docker volume for model persistence.

Saved model versions are never overwritten. An edit creates a new immutable
version.

### Rationale

This stack keeps the codebase small, inspectable, and appropriate for a
single-user technical demonstration while still covering API, persistence,
auditability, testing, and reproducible execution.

### Rejected alternatives

A full enterprise framework stack and managed database were rejected for this
prototype because they would increase setup and code volume without improving
the core reasoning boundary.

Deleting or rewriting historical model versions was rejected because it would
weaken traceability, reproducibility, and auditability.

### Consequences

- The complete workflow is easy to navigate during a live defense.
- Docker Compose provides a reproducible runtime.
- Credentials remain outside the image and repository.
- Historical versions can be inspected and analyzed.
- Local JSON storage is suitable for one process and one user.
- A production evolution would require stronger typing, durable distributed
  storage, authentication, authorization, centralized observability, and
  concurrency controls.

## What breaks at 10x scope

The current design is optimized for a small graph, a single user, and four
deterministic scenario types.

At 10x scope:

- larger descriptions would increase extraction latency, token use, and
  ambiguity;
- JSON persistence would not safely support concurrent users or multiple
  application replicas;
- the formal model would need regions, fallback behavior, load balancers,
  queue depth, richer SLOs, and recovery policies;
- closed-form steady-state formulas would be insufficient for dynamic
  traffic, queueing, and recovery behavior;
- telemetry would require centralized collection and distributed tracing;
- identity, authorization, rate limiting, and tenant isolation would become
  mandatory.

A production evolution would introduce a durable database, model migrations,
centralized telemetry, concurrency controls, identity, policy enforcement,
and time-dependent simulation only where required.
