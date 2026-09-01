# Architecture Reasoning Engine

A constrained service that receives a free-text architecture description and a "what if" question, builds a formal model, and returns results backed by deterministic computation.

> **Core principle: AI interprets. Code calculates.**

## Current Status

Work in progress for an AI Solutions Architect technical case.

## Objective

The system will:

- extract components and dependencies from free text;
- validate the formal model;
- identify missing or contradictory information;
- simulate supported scenarios through deterministic code;
- explain results without allowing the language model to calculate numbers;
- refuse questions that the formal model cannot answer.

## Minimum Supported Scenarios

1. A component becomes unavailable.
2. A component degrades in latency.
3. Incoming load is multiplied by N.

## Planned Documentation

- `DECISIONS.md`: architecture decisions and rejected alternatives.
- `MODEL.md`: formal schema and mathematical formulas.
- `VALIDATION.md`: validation cases, measured results, and failure analysis.
- `NOT_DONE.md`: deliberately excluded functionality and rationale.

## Running the Service

Final setup and execution instructions will be added after the first functional version is available.