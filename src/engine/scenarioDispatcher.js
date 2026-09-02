import { ScenarioQuestionSchema } from '../model/scenarioSchema.js';

import {
  analyzeComponentUnavailable,
  analyzeLatencyDegradation,
  analyzeLoadMultiplication
} from './scenarioEngine.js';

/**
 * Creates a consistent refusal when the formal model or scenario does not
 * contain enough information for a deterministic answer.
 */
function createNotAnswerable(
  scenarioType,
  reason,
  missingInformation = []
) {
  return {
    status: 'NOT_ANSWERABLE',
    scenarioType,
    reason,
    missingInformation,
    assumptions: []
  };
}

/**
 * Finds a service or data store by its formal component identifier.
 */
function findComponent(architectureModel, componentId) {
  return [
    ...architectureModel.services,
    ...architectureModel.dataStores
  ].find((component) => component.id === componentId);
}

/**
 * Adds visible interpretation assumptions to the deterministic result.
 */
function includeInterpretationAssumptions(result, assumptions) {
  return {
    ...result,
    assumptions: [
      ...(result.assumptions ?? []),
      ...assumptions
    ]
  };
}

/**
 * Selects and runs the deterministic simulation for a formal scenario.
 *
 * This function never calls an LLM. Every calculation is delegated to the
 * scenario engine or performed directly in code.
 */
export function dispatchScenario(architectureModel, scenarioInput) {
  const validation = ScenarioQuestionSchema.safeParse(scenarioInput);

  if (!validation.success) {
    return createNotAnswerable(
      'invalid_scenario',
      'The scenario does not follow the required formal structure.',
      validation.error.issues.map((issue) => issue.message)
    );
  }

  const scenario = validation.data;

  if (scenario.type === 'unsupported') {
    return createNotAnswerable(
      scenario.type,
      scenario.unsupportedReason ??
        'The question is outside the supported scenario types.',
      scenario.missingInformation
    );
  }

  if (scenario.missingInformation.length > 0) {
    return createNotAnswerable(
      scenario.type,
      'The scenario question is missing required information.',
      scenario.missingInformation
    );
  }

  if (scenario.type === 'component_unavailable') {
    if (!scenario.componentId) {
      return createNotAnswerable(
        scenario.type,
        'The unavailable component was not identified.',
        ['componentId']
      );
    }

    const result = analyzeComponentUnavailable(
      architectureModel,
      scenario.componentId
    );

    return includeInterpretationAssumptions(
      result,
      scenario.assumptions
    );
  }

  if (scenario.type === 'latency_degradation') {
    if (!scenario.componentId) {
      return createNotAnswerable(
        scenario.type,
        'The degraded component was not identified.',
        ['componentId']
      );
    }

    if (
      scenario.newLatencyMs !== null &&
      scenario.latencyMultiplier !== null
    ) {
      return createNotAnswerable(
        scenario.type,
        'The question contains two different latency changes.',
        ['Provide either newLatencyMs or latencyMultiplier, not both.']
      );
    }

    let scenarioLatencyMs = scenario.newLatencyMs;

    if (
      scenarioLatencyMs === null &&
      scenario.latencyMultiplier !== null
    ) {
      const component = findComponent(
        architectureModel,
        scenario.componentId
      );

      if (!component) {
        return createNotAnswerable(
          scenario.type,
          `Component '${scenario.componentId}' does not exist in the model.`,
          ['A known componentId is required.']
        );
      }

      if (component.baselineLatencyMs === null) {
        return createNotAnswerable(
          scenario.type,
          'A latency multiplier requires the baseline component latency.',
          [`baselineLatencyMs for '${scenario.componentId}'`]
        );
      }

      scenarioLatencyMs =
        component.baselineLatencyMs *
        scenario.latencyMultiplier;
    }

    if (scenarioLatencyMs === null) {
      return createNotAnswerable(
        scenario.type,
        'The new component latency was not provided.',
        ['newLatencyMs or latencyMultiplier']
      );
    }

    const result = analyzeLatencyDegradation(
      architectureModel,
      scenario.componentId,
      scenarioLatencyMs
    );

    return includeInterpretationAssumptions(
      result,
      scenario.assumptions
    );
  }

  if (scenario.type === 'load_multiplication') {
    if (scenario.loadMultiplier === null) {
      return createNotAnswerable(
        scenario.type,
        'The incoming-load multiplier was not provided.',
        ['loadMultiplier']
      );
    }

    const result = analyzeLoadMultiplication(
      architectureModel,
      scenario.loadMultiplier
    );

    return includeInterpretationAssumptions(
      result,
      scenario.assumptions
    );
  }

  return createNotAnswerable(
    scenario.type,
    'No deterministic handler exists for this scenario type.'
  );
}