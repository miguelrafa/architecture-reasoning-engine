import { calculateRequestCost } from './engine/costCalculator.js';
import { dispatchScenario } from './engine/scenarioDispatcher.js';
import { extractArchitecture } from './llm/architectureExtractor.js';
import {
  interpretScenarioQuestion
} from './llm/questionInterpreter.js';
import { validateSemantics } from './model/semanticValidator.js';

/**
 * Adds a deterministic cost calculation to one Foundry call.
 */
function enrichCallTelemetry(telemetry) {
  return {
    ...telemetry,
    cost: calculateRequestCost(
      telemetry.inputTokens,
      telemetry.outputTokens
    )
  };
}

/**
 * Combines telemetry from all LLM calls used by one analysis request.
 *
 * Latency and token counts come from measured execution data.
 * Cost is always calculated in code.
 */
function createRequestTelemetry(
  requestStartedAt,
  extractionTelemetry,
  interpretationTelemetry = null
) {
  const totalInputTokens =
    extractionTelemetry.inputTokens +
    (interpretationTelemetry?.inputTokens ?? 0);

  const totalOutputTokens =
    extractionTelemetry.outputTokens +
    (interpretationTelemetry?.outputTokens ?? 0);

  const totalTokens = totalInputTokens + totalOutputTokens;

  const totalCost = calculateRequestCost(
    totalInputTokens,
    totalOutputTokens
  );

  return {
    totalLatencyMs: Math.round(
      performance.now() - requestStartedAt
    ),
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalEstimatedCostUsd: totalCost.totalCostUsd,
    estimatedCostPer1000RequestsUsd:
      totalCost.estimatedCostPer1000RequestsUsd,
    currency: totalCost.currency,
    calls: {
      architectureExtraction: enrichCallTelemetry(
        extractionTelemetry
      ),
      scenarioInterpretation: interpretationTelemetry
        ? enrichCallTelemetry(interpretationTelemetry)
        : null
    }
  };
}

/**
 * Runs the complete architecture reasoning workflow.
 *
 * Foundry performs only two interpretation tasks:
 * - free text to formal architecture model;
 * - free-text question to formal scenario.
 *
 * Validation, refusal decisions, simulation, and cost calculation are
 * deterministic operations performed by code.
 */
export async function reasonAboutArchitecture(
  architectureDescription,
  scenarioQuestion
) {
  const requestStartedAt = performance.now();

  const extraction = await extractArchitecture(
    architectureDescription
  );

  const modelValidation = validateSemantics(extraction.model);

  /**
   * Semantic errors make the model unsafe for deterministic simulation.
   * The system returns the extracted model and validation evidence instead
   * of asking the LLM to produce a plausible answer.
   */
  if (!modelValidation.isValid) {
    return {
      status: 'NOT_ANSWERABLE',
      reason:
        'The architecture model contains semantic errors and cannot be simulated safely.',
      model: extraction.model,
      modelValidation,
      scenario: null,
      result: null,
      telemetry: createRequestTelemetry(
        requestStartedAt,
        extraction.telemetry
      )
    };
  }

  const interpretation = await interpretScenarioQuestion(
    extraction.model,
    scenarioQuestion
  );

  const result = dispatchScenario(
    extraction.model,
    interpretation.scenario
  );

  return {
    status: result.status,
    reason:
      result.status === 'NOT_ANSWERABLE'
        ? result.reason
        : null,
    model: extraction.model,
    modelValidation,
    scenario: interpretation.scenario,
    result,
    telemetry: createRequestTelemetry(
      requestStartedAt,
      extraction.telemetry,
      interpretation.telemetry
    )
  };
}