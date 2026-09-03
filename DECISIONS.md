# Architecture Decisions

**Status:** Accepted

This document records the principal architectural decisions, their rationale, the alternatives considered, and their accepted consequences.

## Decision 1: Constrain the Reasoning Domain

### Context

Natural-language architecture descriptions can represent an unlimited number of technologies, relationships, and operational questions. An unrestricted architecture assistant could produce plausible answers that are not supported by the available model.

### Decision

The engine supports three explicit scenario categories:

1. component unavailability;
2. component latency degradation;
3. incoming-load multiplication.

Questions outside these categories return `NOT_ANSWERABLE`.

### Rationale

A constrained reasoning domain provides clear behavioral boundaries. Each supported scenario has an explicit input schema, answerability rules, and a deterministic implementation.

The engine can still process unseen component names and architecture descriptions as long as they can be represented by the formal model.

### Rejected Alternative

A general-purpose architecture chatbot was rejected because its answers would be difficult to reproduce, validate, and audit.

### Consequences

* Supported analyses are predictable and testable.
* Missing information remains visible.
* Unsupported questions produce explicit refusals.
* New scenarios require a new schema and deterministic handler.

## Decision 2: Use AI for Interpretation, Not Calculation

### Context

Natural-language descriptions may use different terminology, units, naming conventions, and sentence structures. Microsoft Foundry is useful for converting this input into structured data.

Using a language model for numerical reasoning, however, would make calculated results less reproducible.

### Decision

Microsoft Foundry performs two interpretation tasks:

* architecture description to formal architecture model;
* what-if question to formal scenario.

Application code performs:

* structural and semantic validation;
* answerability decisions;
* unit normalization;
* capacity and utilization calculations;
* retry amplification;
* timeout evaluation;
* dependency propagation and blast-radius analysis;
* token-cost calculation.

### Rationale

This separation establishes a clear trust boundary:

> **AI interprets. Code validates and calculates.**

Every reported quantity can be traced to measured input or deterministic application logic.

### Rejected Alternative

Allowing the language model to calculate capacity, saturation, timeout impact, or blast radius was rejected because those results would be harder to test and reproduce.

### Consequences

* Interpretation and calculation can be evaluated independently.
* Deterministic tests do not require live Foundry calls.
* Language-model variability cannot change the mathematical formulas.
* Invalid or incomplete models are refused instead of being silently completed.

## Decision 3: Use Closed-Form Formulas and Graph Traversal

### Context

The supported scenarios operate on small architecture graphs under steady-state assumptions. They require capacity, retry, utilization, saturation, timeout, and dependency-impact calculations.

A time-dependent simulation engine would introduce additional model requirements and operational complexity.

### Decision

The engine uses:

* closed-form formulas for capacity, attempts, effective load, utilization, and saturation;
* threshold comparisons for timeout evaluation;
* deterministic reverse graph traversal for failure propagation;
* explicit missing-information rules when a calculation cannot be completed safely.

### Rationale

These techniques are sufficient for the supported scenarios and make every result explainable by hand.

### Rejected Alternatives

Monte Carlo and discrete-event simulation were rejected because they require traffic distributions, queue behavior, timing models, and repeated execution that are outside the current formal model.

### Consequences

* Results are reproducible.
* Formulas can be covered by focused unit tests.
* The engine assumes steady-state behavior.
* Queue depth, recovery over time, and probabilistic traffic are not modeled.
* Asynchronous dependencies do not automatically propagate unavailability.

## Decision 4: Use a Minimal Containerized JavaScript Stack with Immutable Versioning

### Context

The core value of the system is the reasoning boundary and its deterministic behavior. A large framework and infrastructure stack would add operational components without changing that core.

The formal architecture model must also remain inspectable and reusable after the initial language-model extraction.

### Decision

The implementation uses:

* Node.js with plain JavaScript;
* Express for the HTTP API;
* Zod for explicit schema validation;
* the OpenAI-compatible client for Microsoft Foundry;
* plain HTML, CSS, and browser JavaScript;
* a local JSON repository for architecture models;
* immutable model versions;
* the built-in Node.js test runner;
* Docker Compose as the portable runtime.

A stored model version can be selected and analyzed with a new question without repeating architecture extraction.

### Rationale

This stack keeps the system easy to inspect, run, test, and extend. Immutable versions preserve the exact model used for each analysis and provide a simple audit history.

### Rejected Alternatives

A full TypeScript, NestJS, database, distributed tracing, and frontend-framework implementation was not selected because it would add infrastructure and code volume without improving the deterministic reasoning core.

Mutable version history and version deletion through the interface were rejected because they would weaken traceability.

### Consequences

* The complete application runs as one container.
* Docker Compose provides a repeatable local runtime.
* Stored models survive container recreation through a named volume.
* Historical versions remain immutable.
* JSON persistence is appropriate for local and self-hosted single-instance use.
* Multi-user or multi-replica operation would require durable database storage and concurrency control.

## What Breaks at 10x Scope

The current architecture is optimized for small graphs, a focused reasoning domain, and a single application instance.

At significantly larger scale:

* longer descriptions would increase interpretation latency, token usage, and ambiguity;
* JSON persistence would not safely support concurrent writers or multiple replicas;
* the formal model would require concepts such as regions, fallback behavior, load balancing, queue depth, and service-level objectives;
* steady-state formulas would be insufficient for dynamic traffic and recovery behavior;
* request telemetry would require centralized observability;
* authentication, authorization, tenant isolation, and retention policies would become necessary.

A larger-scale evolution would introduce durable database storage, model migrations, concurrency controls, centralized tracing, managed secrets, and additional simulation strategies while preserving the separation between AI interpretation and deterministic computation.
