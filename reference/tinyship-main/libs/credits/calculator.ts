import { config } from '@config';
import { resolveFixedConsumption, type FixedConsumptionConfig } from '../../config/credits';
import type { CalculateConsumptionParams } from './types';

/**
 * Calculate the number of credits to consume based on token usage
 * Supports both fixed and dynamic consumption modes
 */
export function calculateCreditConsumption(params: CalculateConsumptionParams): number {
  const { totalTokens, model, type = 'aiChat' } = params;
  const creditsConfig = config.credits;

  // Fixed consumption mode: return static amount per operation
  if (creditsConfig.consumptionMode === 'fixed') {
    const fixedConfig = creditsConfig.fixedConsumption[type] as FixedConsumptionConfig;
    return resolveFixedConsumption(fixedConfig, model);
  }

  // Dynamic consumption mode: calculate based on token usage
  const { tokensPerCredit, modelMultipliers } = creditsConfig.dynamicConsumption;
  
  // Get model-specific multiplier or default
  const multiplier = modelMultipliers[model] ?? modelMultipliers['default'] ?? 1.0;
  
  // Calculate credits: (tokens / tokensPerCredit) * multiplier
  // Use Math.ceil to round up (minimum 1 credit per operation)
  const credits = Math.ceil((totalTokens / tokensPerCredit) * multiplier);
  
  // Ensure minimum of 1 credit consumed per operation
  return Math.max(1, credits);
}

/**
 * Get the estimated credits for a fixed consumption operation
 * Useful for showing users expected cost before executing
 */
export function getFixedConsumptionAmount(
  operation: keyof typeof config.credits.fixedConsumption,
  model?: string
): number {
  const fixedConfig = config.credits.fixedConsumption[operation] as FixedConsumptionConfig;
  return resolveFixedConsumption(fixedConfig, model);
}

/**
 * Check if credits system is using dynamic consumption mode
 */
export function isDynamicMode(): boolean {
  return config.credits.consumptionMode === 'dynamic';
}

/**
 * Get the model multiplier for credit calculation
 */
export function getModelMultiplier(model: string): number {
  const { modelMultipliers } = config.credits.dynamicConsumption;
  return modelMultipliers[model] ?? modelMultipliers['default'] ?? 1.0;
}
