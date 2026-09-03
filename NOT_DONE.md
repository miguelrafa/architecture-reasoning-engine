# Current Scope and Future Evolution

This document defines the intentional boundaries of the current architecture and identifies capabilities that can be added as the system evolves.

## Supported Reasoning Domain

The engine supports three deterministic scenario categories:

1. component unavailability;
2. component latency degradation;
3. incoming-load multiplication.

Questions outside these categories return `NOT_ANSWERABLE`. New scenario types can be introduced through additional validated schemas and deterministic handlers.

## Deterministic Computation Boundary

Microsoft Foundry converts natural-language input into structured architecture and scenario data. It does not calculate capacity, utilization, retry amplification, timeout impact, cost, or blast radius.

All quantitative results are produced by application code so they remain reproducible, testable, and auditable.

## Simulation Boundaries

The current model uses steady-state formulas and deterministic graph traversal for architectures of up to 15 components.

It does not currently model:

* queue depth or queueing theory;
* probabilistic traffic distributions;
* recovery behavior over time;
* Monte Carlo or discrete-event simulation;
* regional failover and geographic topology.

These capabilities would require an extended formal model and separate simulation strategies.

## Availability Measurement

Declared availability percentages are treated as architectural targets rather than observed measurements.

Calculating actual availability would require operational data such as outage duration, observation windows, fallback behavior, and measured request impact.

## Persistence and Version Governance

Architecture models are stored in a local JSON repository with immutable versions. Immutability preserves the relationship between a model version and its analysis history.

The current implementation does not provide version deletion or renaming through the web interface. A distributed deployment would introduce database storage, transactions, concurrency control, retention policies, backups, and schema migrations.

## Identity and Access Control

Authentication, authorization, tenant isolation, role-based access control, and user-specific model ownership are not part of the current runtime.

These controls should be introduced before operating the service as a shared multi-user platform.

## Operational Evolution

A production-scale evolution could add:

* centralized metrics and distributed tracing;
* request rate limiting and quotas;
* circuit breakers and controlled retries for external AI calls;
* managed secret storage and automated key rotation;
* CI/CD and automated security scanning;
* durable cloud storage and multiple application replicas.

## Credential Management

Microsoft Foundry credentials are never stored in source control or embedded in the container image.

Each operator supplies credentials at runtime through environment variables, using `.env.example` as the configuration template.

These boundaries keep the current system focused on its central architectural principle: **AI interprets; deterministic code validates and calculates.**
