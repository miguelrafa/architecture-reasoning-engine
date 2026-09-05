import 'dotenv/config';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { ScenarioQuestionSchema } from '../model/scenarioSchema.js';

/**
 * Instructions that constrain the LLM to scenario classification.
 * The LLM identifies parameters but never answers or simulates the scenario.
 */
const INTERPRETATION_INSTRUCTIONS = `
You are a scenario question interpreter.

Your only responsibility is to translate a free-text question into the
supplied formal scenario structure.

Supported scenario types:
1. component_unavailable
2. latency_degradation
3. load_multiplication
4. circuit_breaker_state_change

Rules:
1. Never answer the question.
2. Never simulate architectural behavior.
3. Never calculate capacity, utilization, saturation, timeout impact,
   availability, throughput, or affected components.
4. Use an exact component identifier from availableComponents.
5. If the component is not present in availableComponents, set componentId
   to null and explain the problem in missingInformation.
6. For an unavailable component, use component_unavailable.
7. For an absolute new latency, use latency_degradation and newLatencyMs.
8. For a relative latency change, use latency_degradation and
   latencyMultiplier.
9. For multiplied incoming traffic, use load_multiplication and
   loadMultiplier.
10. For a circuit breaker opening, entering half-open, or closing after
    recovery, use circuit_breaker_state_change. Copy the exact from and to
    identifiers from availableCircuitBreakers and set circuitBreakerState.
11. If the question does not identify one available circuit breaker
    unambiguously, leave its identifiers null and describe the ambiguity in
    missingInformation.
12. Set fields that do not apply to null.
13. Use unsupported only when the question is outside the four supported
    scenario types.
14. Make every conservative interpretation visible in assumptions.
`;

/**
 * Creates the OpenAI client from environment variables.
 * Secrets remain outside the source code and Git repository.
 */
function createFoundryClient() {
  const baseURL = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!baseURL || !apiKey || !model) {
    throw new Error(
      'Missing OPENAI_BASE_URL, OPENAI_API_KEY, or OPENAI_MODEL configuration.'
    );
  }

  return {
    client: new OpenAI({
      baseURL,
      apiKey
    }),
    model
  };
}

/**
 * Translates a natural-language question into a formal scenario.
 *
 * The architecture model is used only to provide valid component IDs.
 * Deterministic code later verifies the parameters and runs the simulation.
 */
export async function interpretScenarioQuestion(
  architectureModel,
  question
) {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('Scenario question must be a non-empty string.');
  }

  if (
    !architectureModel ||
    !Array.isArray(architectureModel.services) ||
    !Array.isArray(architectureModel.dataStores)
  ) {
    throw new Error(
      'A valid architecture model is required to interpret the question.'
    );
  }

  const availableComponents = [
    ...architectureModel.services.map((service) => ({
      id: service.id,
      name: service.name,
      type: 'service'
    })),
    ...architectureModel.dataStores.map((dataStore) => ({
      id: dataStore.id,
      name: dataStore.name,
      type: 'data-store'
    }))
  ];

  const availableCircuitBreakers = architectureModel.dependencies
    .filter((dependency) => dependency.circuitBreaker != null)
    .map((dependency) => ({
      from: dependency.from,
      to: dependency.to,
      callType: dependency.callType,
      messageBufferComponentId:
        dependency.circuitBreaker.messageBufferComponentId,
      openBehavior: dependency.circuitBreaker.openBehavior
    }));

  const { client, model } = createFoundryClient();
  const startedAt = performance.now();

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: 'system',
        content: INTERPRETATION_INSTRUCTIONS
      },
      {
        role: 'user',
        content: JSON.stringify({
          question: question.trim(),
          availableComponents,
          availableCircuitBreakers
        })
      }
    ],
    text: {
      format: zodTextFormat(
        ScenarioQuestionSchema,
        'scenario_question'
      )
    }
  });

  const latencyMs = Math.round(performance.now() - startedAt);

  if (!response.output_parsed) {
    throw new Error(
      'Microsoft Foundry did not return a structured scenario.'
    );
  }

  const validation = ScenarioQuestionSchema.safeParse(
    response.output_parsed
  );

  if (!validation.success) {
    throw new Error(
      `Foundry returned an invalid scenario: ${
        validation.error.message
      }`
    );
  }

  return {
    scenario: validation.data,
    telemetry: {
      latencyMs,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0
    }
  };
}
