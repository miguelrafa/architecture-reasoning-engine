# Architecture Decisions

**Status:** Work in progress

This document records the main architectural forks, the selected options, their rationale, and their accepted consequences.

## Decision 1: Build a constrained reasoning service, not a general architecture chatbot

### Context

The input is written in natural language and may describe different small architectures. However, the engine must produce defensible and testable results without inventing missing information.

A general-purpose architecture chatbot could answer a broad range of questions, but its behavior and calculations would be difficult to constrain and verify.

### Decision

The service will accept different architecture descriptions that fit the formal model, but it will support only three scenario categories:

1. component unavailability;
2. component latency degradation;
3. incoming load multiplication.

Questions outside these categories will return an explicit `NOT_ANSWERABLE` result.

### Rationale

A narrow reasoning domain makes the behavior understandable, deterministic, testable, and appropriate for the three-day time budget.

The natural-language input remains flexible, while the reasoning capabilities are deliberately constrained.

### Rejected Alternative

A general architecture chatbot was rejected because it would encourage plausible but unsupported answers and would make the boundary between language-model interpretation and deterministic computation unclear.

### Consequences

- The system can process unseen component names and architecture descriptions.
- The system cannot answer every architecture question.
- Unsupported questions are treated as expected refusals, not system failures.
- Additional scenario types can be added later as separate deterministic handlers.

## Decision 2: Use the language model for interpretation, not computation

### Context

Natural-language architecture descriptions are ambiguous and cannot be reliably processed with fixed string rules alone. A language model is useful for identifying components, dependencies, call types, declared values, and scenario intent.

However, the case explicitly requires every calculated quantity to come from verifiable code.

### Decision

Microsoft Foundry will be used only to translate:

- the architecture description into structured extraction candidates;
- the what-if question into one supported scenario type.

Deterministic application code will:

- validate the extracted structure;
- normalize units;
- identify missing or contradictory data;
- apply assumptions;
- run every formula;
- calculate blast radius;
- decide whether the question is answerable;
- format every quantitative result.

### Rejected Alternative

Allowing the language model to reason about capacity, saturation, availability, latency, or blast radius was rejected because its numerical output would not be reliably testable or reproducible.

### Consequences

- The boundary between probabilistic interpretation and deterministic computation is explicit.
- Golden tests can run without live model calls.
- Extraction quality and calculation correctness can be measured separately.
- The first version will use deterministic response templates to prevent the language model from introducing new numbers.

## Decision 3: Use closed-form formulas and graph traversal

### Context

The engine must analyze graphs of no more than 15 components under steady-state conditions. The required scenarios involve capacity, retry amplification, utilization, saturation, latency thresholds, and dependency impact.

A discrete-event or Monte Carlo simulation would add implementation and validation complexity that is not required for the supported scenarios.

### Decision

The engine will use:

- closed-form formulas for capacity, attempts, effective load, utilization, and saturation;
- deterministic graph traversal for failure propagation and blast-radius identification;
- explicit assumptions for behavior that is not fully described.

### Rejected Alternative

Monte Carlo and discrete-event simulation were rejected because they would increase complexity, execution cost, and explanation difficulty without improving the three supported scenarios.

### Consequences

- Every result can be derived by hand.
- The mathematical behavior is easy to test with golden cases.
- The model assumes steady state.
- The engine will not model detailed request timing, traffic distributions, queueing theory, or recovery over time.

## Decision 4: Use a minimal JavaScript stack

### Context

The company's production stack includes TypeScript, NestJS, Drizzle, Postgres, OpenTelemetry, and Next.js. Using that complete stack could be advantageous for a production platform, but it would add framework and infrastructure complexity unrelated to the core reasoning problem.

The solution must remain understandable and modifiable during the live defense.

### Decision

The implementation will use:

- Node.js with plain JavaScript;
- Express for a small HTTP API;
- Zod for explicit schema validation;
- the OpenAI-compatible SDK for Microsoft Foundry;
- plain HTML, CSS, and browser JavaScript for the minimal UI;
- JSON files for persisted models and request traces;
- the built-in Node.js test runner for deterministic tests.

### Rejected Alternative

A full TypeScript, NestJS, Postgres, OpenTelemetry, and Next.js implementation was rejected for this version because it would increase setup, code volume, and live-modification difficulty without improving the core reasoning engine.

### Consequences

- The project has fewer moving parts and dependencies.
- The complete flow remains easy to navigate during the defense.
- The implementation is appropriate for a single-user technical demonstration.
- A production evolution would require stronger typing, durable storage, distributed tracing, authentication, and operational controls.

## Decision 5: Docker Compose is the required runtime; Azure Container Apps is an additional demo deployment

### Context

The required deliverable must run with `docker compose up` on a clean machine. A public Azure deployment is useful for demonstration, but it must not replace or complicate the reproducible local runtime.

### Decision

The same application container will be used in two environments:

- Docker Compose for the required local and evaluator runtime;
- Azure Container Apps Consumption for an additional public demonstration URL.

Azure Container Apps will use zero minimum replicas to minimize Student Subscription costs. Deployment will be performed manually with Azure CLI, without CI/CD or GitHub Actions.

### Rejected Alternatives

A virtual machine, Azure Kubernetes Service, and a permanent App Service plan were rejected because they add fixed cost or operational complexity that is unnecessary for a single-container demonstration.

### Consequences

- The required deliverable remains independent from Azure availability.
- The Azure deployment provides a convenient public demo.
- Local JSON persistence is durable through a Docker bind mount.
- Container-local files in Azure are ephemeral and may be lost after a restart; durable Azure storage is deliberately out of scope.
- The local Docker runtime remains the presentation fallback.

## What Breaks at 10x Scope

The current design is intentionally optimized for a small graph, a single user, and three deterministic scenario types.

At 10x scope:

- larger and more detailed descriptions would increase extraction latency, token usage, and ambiguity;
- JSON file persistence would not safely support concurrent users or multiple container replicas;
- the simple formal model would need richer concepts such as regions, fallback behavior, load balancing, queue depth, and service-level objectives;
- closed-form steady-state formulas would become insufficient for dynamic traffic, queueing, and recovery behavior;
- local request traces would need centralized observability;
- the plain JavaScript codebase would benefit from TypeScript and stronger module boundaries.

A production evolution would introduce durable database storage, versioned model migrations, centralized tracing, authentication, concurrency controls, and potentially discrete-event simulation for scenarios that require time-dependent behavior.