import 'dotenv/config';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { ArchitectureModelSchema } from '../model/schema.js';

/**
 * Instructions that constrain the LLM to information extraction.
 * The LLM must not calculate scenario results or invent missing numbers.
 */
const EXTRACTION_INSTRUCTIONS = `
You are an architecture information extractor.

Your only responsibility is to transform a free-text architecture
description into the supplied formal model.

Rules:
1. Extract only information stated in the description or directly implied
   by ordinary architectural language.
2. Never answer scenario questions.
3. Never calculate capacity, utilization, availability, latency impact,
   retry amplification, or any other result.
4. Never invent numeric values. Use null when a numeric value is missing.
5. Use short lowercase kebab-case identifiers for components.
6. A data store must be placed in dataStores, not services.
7. Dependencies may point to either services or data stores.
8. If the call type is unclear, use sync as a conservative assumption and
   record that decision in assumptions.
9. If whether a dependency is required is unclear, use true as a
   conservative assumption and record that decision in assumptions.
10. If retries are not mentioned, use null for retryPolicy.
11. Record important missing information in missingInformation.
12. Record short supporting excerpts or paraphrases in sourceEvidence.
13. Set modelVersion to "1.0".
`;

/**
 * Creates the OpenAI client from environment variables.
 * The real API key remains outside the source code and Git repository.
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
 * Uses Microsoft Foundry only to translate free text into a formal model.
 * Zod verifies that the returned object follows our agreed structure.
 */
export async function extractArchitecture(architectureDescription) {
  if (
    typeof architectureDescription !== 'string' ||
    architectureDescription.trim().length === 0
  ) {
    throw new Error('Architecture description must be a non-empty string.');
  }

  const { client, model } = createFoundryClient();
  const startedAt = performance.now();

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: 'system',
        content: EXTRACTION_INSTRUCTIONS
      },
      {
        role: 'user',
        content: architectureDescription.trim()
      }
    ],
    text: {
      format: zodTextFormat(
        ArchitectureModelSchema,
        'architecture_model'
      )
    }
  });

  const latencyMs = Math.round(performance.now() - startedAt);

  if (!response.output_parsed) {
    throw new Error(
      'Microsoft Foundry did not return a structured architecture model.'
    );
  }

  const validation = ArchitectureModelSchema.safeParse(
    response.output_parsed
  );

  if (!validation.success) {
    throw new Error(
      `Foundry returned an invalid architecture model: ${
        validation.error.message
      }`
    );
  }

  return {
    model: validation.data,
    telemetry: {
      latencyMs,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0
    }
  };
}