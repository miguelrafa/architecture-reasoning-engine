/**
 * Public Azure pricing used by this project.
 *
 * Prices are expressed in US dollars per one million tokens.
 * Source: Azure OpenAI pricing page.
 * Verified: 2026-09-02.
 */
export const DEFAULT_MODEL_PRICING = Object.freeze({
  model: 'gpt-4.1-mini',
  deploymentType: 'GlobalStandard',
  currency: 'USD',
  inputUsdPerMillionTokens: 0.4,
  outputUsdPerMillionTokens: 1.6,
  verifiedOn: '2026-09-02'
});

/**
 * Ensures that token usage came from a valid service measurement.
 */
function validateTokenCount(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${fieldName} must be a non-negative integer.`
    );
  }
}

/**
 * Preserves enough decimal places for very small per-request costs.
 */
function roundUsd(value) {
  return Number(value.toFixed(10));
}

/**
 * Calculates the estimated cost of one LLM request.
 *
 * Token counts come from Microsoft Foundry telemetry. Pricing is defined
 * in code, so the LLM cannot invent or alter the cost.
 */
export function calculateRequestCost(
  inputTokens,
  outputTokens,
  pricing = DEFAULT_MODEL_PRICING
) {
  validateTokenCount(inputTokens, 'inputTokens');
  validateTokenCount(outputTokens, 'outputTokens');

  const inputCostUsd =
    (inputTokens / 1_000_000) *
    pricing.inputUsdPerMillionTokens;

  const outputCostUsd =
    (outputTokens / 1_000_000) *
    pricing.outputUsdPerMillionTokens;

  const totalCostUsd = inputCostUsd + outputCostUsd;

  return {
    model: pricing.model,
    deploymentType: pricing.deploymentType,
    currency: pricing.currency,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    totalCostUsd: roundUsd(totalCostUsd),

    // Projection assuming one thousand requests with the same token usage.
    estimatedCostPer1000RequestsUsd: roundUsd(
      totalCostUsd * 1000
    ),

    pricingVerifiedOn: pricing.verifiedOn
  };
}