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
 * Combines telemetry from the optional LLM calls used by one request.
 *
 * A new free-text architecture uses extraction and question interpretation.
 * A saved formal model skips extraction and uses only question interpretation.
 */
function createRequestTelemetry(
  requestStartedAt,
  extractionTelemetry = null,
  interpretationTelemetry = null
) {
  const totalInputTokens =
    (extractionTelemetry?.inputTokens ?? 0) +
    (interpretationTelemetry?.inputTokens ?? 0);

  const totalOutputTokens =
    (extractionTelemetry?.outputTokens ?? 0) +
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
      architectureExtraction: extractionTelemetry
        ? enrichCallTelemetry(extractionTelemetry)
        : null,
      scenarioInterpretation: interpretationTelemetry
        ? enrichCallTelemetry(interpretationTelemetry)
        : null
    }
  };
}

/**
 * Produces an explicit refusal when semantic errors make deterministic
 * simulation unsafe.
 */
function createInvalidModelResult(
  model,
  modelValidation,
  requestStartedAt,
  extractionTelemetry = null
) {
  return {
    status: 'NOT_ANSWERABLE',
    reason:
      'The architecture model contains semantic errors and cannot be simulated safely.',
    model,
    modelValidation,
    scenario: null,
    result: null,
    telemetry: createRequestTelemetry(
      requestStartedAt,
      extractionTelemetry
    )
  };
}

/**
 * Runs the complete reasoning workflow from a natural-language description.
 *
 * Foundry performs two semantic interpretation tasks:
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

  if (!modelValidation.isValid) {
    return createInvalidModelResult(
      extraction.model,
      modelValidation,
      requestStartedAt,
      extraction.telemetry
    );
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

/**
 * Runs a new what-if question against an existing formal model.
 *
 * Architecture extraction is deliberately skipped because the selected
 * stored version is already structured and schema-validated. Foundry is used
 * only to convert the new natural-language question into a formal scenario.
 *
 * Optional dependencies allow deterministic tests without Foundry calls.
 */
export async function reasonAboutModel(
  model,
  scenarioQuestion,
  {
    questionInterpreter = interpretScenarioQuestion,
    scenarioDispatcher = dispatchScenario
  } = {}
) {
  const requestStartedAt = performance.now();
  const modelValidation = validateSemantics(model);

  if (!modelValidation.isValid) {
    return createInvalidModelResult(
      model,
      modelValidation,
      requestStartedAt
    );
  }

  const interpretation = await questionInterpreter(
    model,
    scenarioQuestion
  );

  const result = scenarioDispatcher(
    model,
    interpretation.scenario
  );

  return {
    status: result.status,
    reason:
      result.status === 'NOT_ANSWERABLE'
        ? result.reason
        : null,
    model,
    modelValidation,
    scenario: interpretation.scenario,
    result,
    telemetry: createRequestTelemetry(
      requestStartedAt,
      null,
      interpretation.telemetry
    )
  };
}