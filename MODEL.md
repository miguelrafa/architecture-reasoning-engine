# Formal Model and Mathematics

**Status:** Work in progress  
**Schema version:** 1.0

## Purpose

The formal model is the explicit contract between natural-language interpretation and deterministic computation.

Microsoft Foundry translates an architecture description into candidate structured data. Application code validates that data and creates the canonical formal model used by the reasoning engine.

The model must be inspectable, editable, persisted, versioned, and usable without another language-model call.

## Modeling Boundaries

The first version assumes:

- a directed graph with no more than 15 components;
- steady-state behavior;
- one entry component for incoming traffic;
- synchronous or asynchronous dependencies;
- deterministic capacity and retry calculations;
- three supported scenario types.

The model does not represent cloud regions, resource pricing, deployment topology, detailed queue behavior, recovery over time, or probabilistic traffic distributions.

## Core Concepts

### Component

A component is a service, database, queue, or worker that participates in the architecture.

### Dependency

A dependency is a directed relationship from one component to another. It records whether the call is synchronous or asynchronous and may include timeout and retry information.

### Workload

The workload identifies the entry component and the current incoming requests per second.

### Target

A target is a declared objective such as availability. Declared targets are not treated as measured results.

### Scenario

A scenario describes one hypothetical change applied to the formal model:

1. a component becomes unavailable;
2. a component latency changes;
3. incoming load is multiplied by a factor.

## Canonical Model Structure

### Component Fields

| Field | Meaning | Required |
|---|---|---|
| `id` | Stable lowercase identifier used by the graph | Yes |
| `name` | Human-readable component name | Yes |
| `kind` | `service`, `database`, `queue`, or `worker` | Yes |
| `replicas` | Number of running component instances | No |
| `capacityRpsPerReplica` | Requests per second handled by one replica | No |
| `declaredAvailabilityTargetPct` | Availability target declared in the description | No |

Missing numeric values are represented as `null`. They are never replaced by invented values.

### Dependency Fields

| Field | Meaning | Required |
|---|---|---|
| `from` | Identifier of the calling or producing component | Yes |
| `to` | Identifier of the dependency or consumer component | Yes |
| `callType` | `sync` or `async` | Yes |
| `timeoutMs` | Configured timeout in milliseconds | No |
| `retries` | Retry count after the initial attempt | No |
| `backoff` | `none`, `fixed`, `exponential`, or `unknown` | No |
| `required` | Whether failure of the dependency blocks the caller | Yes |

### Workload Fields

| Field | Meaning | Required |
|---|---|---|
| `entryComponentId` | Component receiving the external traffic | No |
| `incomingRps` | Current external requests per second | No |

### Model-Level Fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Version of the formal model contract |
| `components` | List of architecture components |
| `dependencies` | Directed graph relationships |
| `workload` | Entry point and current load |
| `assumptions` | Explicit assumptions applied by code |
| `sourceEvidence` | Source-text fragments supporting extracted facts |

## Example Formal Model

The following example adds an explicit incoming load of 100 RPS for demonstration purposes:

```json
{
  "schemaVersion": "1.0",
  "components": [
    {
      "id": "checkout",
      "name": "Checkout",
      "kind": "service",
      "replicas": 6,
      "capacityRpsPerReplica": null,
      "declaredAvailabilityTargetPct": 99.9
    },
    {
      "id": "pricing",
      "name": "Pricing",
      "kind": "service",
      "replicas": 4,
      "capacityRpsPerReplica": 80,
      "declaredAvailabilityTargetPct": null
    },
    {
      "id": "postgres",
      "name": "Postgres",
      "kind": "database",
      "replicas": 1,
      "capacityRpsPerReplica": null,
      "declaredAvailabilityTargetPct": null
    }
  ],
  "dependencies": [
    {
      "from": "checkout",
      "to": "pricing",
      "callType": "sync",
      "timeoutMs": 2000,
      "retries": 3,
      "backoff": "none",
      "required": true
    },
    {
      "from": "pricing",
      "to": "postgres",
      "callType": "sync",
      "timeoutMs": null,
      "retries": null,
      "backoff": "unknown",
      "required": true
    }
  ],
  "workload": {
    "entryComponentId": "checkout",
    "incomingRps": 100
  },
  "assumptions": [],
  "sourceEvidence": [
    {
      "field": "components.pricing.replicas",
      "quote": "pricing runs 4 replicas"
    },
    {
      "field": "dependencies.checkout-pricing.timeoutMs",
      "quote": "with a 2s timeout"
    }
  ]
}

## Deterministic Mathematics

### Total Component Capacity

```text
totalCapacityRps = replicas × capacityRpsPerReplica
```

Example:

```text
4 Pricing replicas × 80 RPS = 320 RPS
```

This calculation requires both the replica count and the capacity of each replica.

### Total Attempts

```text
attempts = 1 + retries
```

The initial call counts as one attempt. Retries happen after the initial attempt.

Example:

```text
1 initial attempt + 3 retries = 4 attempts
```

### Retry-Amplified Load

```text
effectiveLoadRps = incomingRps × attempts
```

Example:

```text
100 original RPS × 4 attempts = 400 effective RPS
```

This formula assumes that every retry reaches the downstream component and that timed-out work is not cancelled.

### Utilization

```text
utilizationPct = effectiveLoadRps ÷ totalCapacityRps × 100
```

Example:

```text
400 RPS ÷ 320 RPS × 100 = 125%
```

### Saturation

```text
saturated = effectiveLoadRps >= totalCapacityRps
```

A component is considered saturated when requested load reaches or exceeds modeled capacity.

### Maximum Original Load Before Saturation

```text
maximumOriginalLoadRps = totalCapacityRps ÷ attempts
```

Example:

```text
320 RPS ÷ 4 attempts = 80 original RPS
```

This threshold can be calculated even when the current incoming load is missing.

### Timeout Evaluation

```text
timeoutOccurs = scenarioLatencyMs > configuredTimeoutMs
```

This comparison requires a declared timeout and a scenario latency affecting the synchronous path.

### Blast Radius

The engine starts with the failed or degraded component and follows required synchronous dependencies in reverse.

A caller is added to the affected set when it has a required synchronous dependency on an affected component.

Asynchronous dependencies do not automatically propagate unavailability.

### Availability Limitation

A declared availability target such as 99.9% is a target, not a measured availability value.

The engine will not calculate long-term availability without sufficient information about outage duration, observation window, fallback behavior, and request impact.

## Answerability Rules

### Component Unavailability

The target component must exist in the formal model.

Failure impact can be propagated only through declared required synchronous dependencies.

If the target component does not exist, the scenario returns `NOT_ANSWERABLE`.

### Latency Degradation

The target component and scenario latency must be provided.

A timeout conclusion requires a synchronous path with a declared timeout.

Retry amplification requires a declared retry count.

Absolute load and utilization calculations additionally require:

* current incoming RPS;
* replica count;
* capacity per replica.

If these values are missing, the engine may return partial results and must explicitly list the calculations that cannot be completed.

### Incoming Load Multiplication

The load multiplier and current incoming RPS must be provided.

Capacity and saturation calculations require replica count and capacity per replica for each evaluated component.

If the original incoming load is missing, the scenario returns `NOT_ANSWERABLE`.

## Missing-Information Policy

The engine follows this order:

1. use explicitly declared facts;
2. apply only documented model assumptions;
3. return partial deterministic results when possible;
4. refuse unsupported calculations and list the missing information.

The engine never replaces missing numeric values with language-model estimates.

## Model Validation Rules

| Check                                          | Result                                    |
| ---------------------------------------------- | ----------------------------------------- |
| More than 15 components                        | Block analysis                            |
| Invalid field type or value                    | Block analysis                            |
| Dependency references a missing component      | Block analysis                            |
| Contradictory values for the same fact         | Block analysis                            |
| Cycle in a synchronous dependency path         | Block analysis                            |
| Retry policy without declared backoff          | Warning                                   |
| Synchronous dependency without timeout         | Warning                                   |
| Single replica or single database primary      | Warning: possible single point of failure |
| Missing data required by the selected scenario | Partial result or `NOT_ANSWERABLE`        |
| Unsupported scenario type                      | `NOT_ANSWERABLE`                          |

### Blocking Errors

A blocking error means the formal model cannot be safely used for deterministic computation.

The response must identify the error and no affected calculation may run.

### Warnings

A warning identifies an architectural risk or incomplete configuration but does not automatically invalidate every calculation.

All warnings remain visible in the final response and request trace.


