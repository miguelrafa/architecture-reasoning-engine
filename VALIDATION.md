# Validation

## Validation strategy

The solution is validated at two complementary levels:

1. Deterministic automated tests verify schema validation, semantic rules,
   propagation, capacity, utilization, timeout, refusal, persistence, API,
   cost calculations, and circuit-breaker behavior without calling Microsoft
   Foundry.
2. A live validation set verifies natural-language interpretation and the
   complete end-to-end workflow using the configured Foundry deployment.

This separation keeps mathematical behavior reproducible while still
measuring the semantic interpretation layer with realistic inputs.

## Commands

Run deterministic automated tests:

```bash
npm test
```

Run the live Foundry validation set, including open, half-open, and recovered
circuit-breaker questions:

```bash
node validation/runValidation.js
```
