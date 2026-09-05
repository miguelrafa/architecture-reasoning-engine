# Asynchronous Circuit-Breaker Extension

**Status:** Implemented and covered by deterministic tests

## Scenario

The extension models an asynchronous consumer that invokes a downstream
service through a circuit breaker. A durable queue isolates the producer from
the downstream failure.

When the circuit breaker is open:

* the consumer does not call the downstream service;
* pending messages remain in the declared queue for later retry;
* the upstream producer is not blocked.

The engine evaluates `open`, `half_open`, and `closed` as explicit steady-state
snapshots. It does not simulate elapsed time, queue growth, failure-event
streams, or automatic state transitions.

## Formal Model Changes

Each dependency now includes a nullable `circuitBreaker` field. A declared
breaker contains:

* `failureThreshold`;
* `openDurationMs`;
* `halfOpenMaxCalls`;
* `messageBufferComponentId`;
* `openBehavior`.

The formal scenario adds `circuit_breaker_state_change` with:

* `circuitBreakerFrom`;
* `circuitBreakerTo`;
* `circuitBreakerState`.

Legacy models without `circuitBreaker` are normalized to
`circuitBreaker: null` when they are saved again.

## Deterministic State Semantics

### Open

* Downstream calls: blocked.
* Allowed probe calls: zero.
* Queue consumption: paused.
* Message disposition: `retain_in_queue`.
* Upstream request: not blocked.

### Half-Open

* Downstream calls: limited to configured probes.
* Allowed probe calls: `halfOpenMaxCalls`.
* Queue consumption: probe only.
* Non-probe messages: retained in the queue.

### Closed

* Downstream calls: allowed.
* Queue consumption: resumed.
* Message disposition: normal delivery.

## Deterministic Test Matrix

Seventeen tests were added across the existing test layers.

| Layer | Test | Expected result |
|---|---|---|
| Structural schema | Valid asynchronous breaker | Accepted |
| Structural schema | Failure threshold is zero | Rejected |
| Scenario schema | Valid open-state scenario | Accepted |
| Scenario schema | Unknown breaker state | Rejected |
| Semantic validation | Valid queue-retaining async breaker | Valid model |
| Semantic validation | Unknown message buffer | Blocking error |
| Semantic validation | Queue retention on synchronous dependency | Blocking error |
| Semantic validation | Missing half-open probe limit | Visible missing information |
| Scenario engine | Open breaker | Calls blocked; messages retained |
| Scenario engine | Half-open breaker | Limited probes; other messages retained |
| Scenario engine | Closed after recovery | Normal delivery resumed |
| Scenario engine | Unknown protected dependency | `NOT_ANSWERABLE` |
| Scenario engine | Missing half-open limit | `NOT_ANSWERABLE` |
| Dispatcher | Valid breaker question | Routed to deterministic handler |
| Dispatcher | Missing source and target | `NOT_ANSWERABLE` |
| Reasoning workflow | Interpreted breaker question | Deterministic result returned |
| Persistence | Legacy dependency without breaker field | Normalized to `null` |

Run all deterministic tests without a Foundry call:

```bash
npm test
```

## Live Foundry Validation

Three end-to-end cases were added to `validation/runValidation.js`:

1. breaker opens;
2. breaker enters half-open;
3. breaker closes after recovery.

These cases validate both natural-language interpretation and deterministic
dispatch. They require the Foundry environment variables documented in
`.env.example`.

```bash
node validation/runValidation.js
```

## Copy-Ready Demonstration

### Architecture description

> An order API receives 20 requests per second and publishes notification
> messages asynchronously to a durable notification queue. The order API has
> 2 replicas, each processing 100 requests per second, with a baseline latency
> of 50 milliseconds. The notification queue has 2 replicas, each processing
> 500 messages per second, with a baseline latency of 10 milliseconds. The
> notification queue delivers messages asynchronously to a notification
> consumer. The notification consumer has 2 replicas, each processing 100
> messages per second, with a baseline latency of 25 milliseconds. The
> notification consumer communicates asynchronously with an email service
> through a circuit breaker. The email service has 2 replicas, each processing
> 100 messages per second, with a baseline latency of 80 milliseconds. The
> circuit breaker opens after 5 consecutive failures, stays open for 30
> seconds, and permits 1 probe call while half-open. While the circuit breaker
> is open, pending messages remain in the notification queue for later retry
> and the order API is not blocked. All other dependencies use zero retries.

### Open-state question

> What happens if the circuit breaker between notification-consumer and
> email-service opens?

### Half-open question

> What happens when the circuit breaker between notification-consumer and
> email-service enters half-open state?

### Recovery question

> What happens when the circuit breaker between notification-consumer and
> email-service closes after recovery?

## Design Boundary

Microsoft Foundry extracts the circuit-breaker policy and identifies the
requested state. Application code validates the data and determines message
handling. The language model never decides whether calls are blocked, how many
probe calls are allowed, or where messages remain.

> **AI interprets. Code validates and calculates.**
