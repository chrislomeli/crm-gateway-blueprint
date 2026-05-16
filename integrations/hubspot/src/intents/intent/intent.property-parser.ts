/**
 * Safe JSON parsing utilities for IntentPropertyValueSchema
 * Handles JSON parsing with type coercion for common SQS serialization issues
 */

import { failure, Result, success, logger } from '@platform/core';
import {IntentPropertyValueSchema} from "../../types/intent.types";


/**
 * Safely parse JSON with automatic type coercion for known fields
 * @param inputString - Valid JSON string
 * @returns Result with parsed and normalized IntentPropertyValueSchema or error
 */
export function parseIntentPropertyValue(
    inputString: string,
): Result<IntentPropertyValueSchema> {
  if (!inputString || typeof inputString !== 'string') {
    return failure({
      message: 'Input string is required and must be a string',
      type: 'ValidationError',
    });
  }

  try {
    // Parse the JSON directly
    const parsed = JSON.parse(inputString);

    // Normalize and validate the data
    return normalizeAndValidateIntent(parsed);
  } catch (error) {
    return failure({
      message: `JSON parsing failed: ${
          error instanceof Error ? error.message : String(error)
      }`,
      type: 'ParseError',
    });
  }
}

/**
 * Normalize and validate intent data, coercing types where needed
 * Handles common SQS serialization issues where numbers/booleans become strings
 */
function normalizeAndValidateIntent(
    obj: unknown,
): Result<IntentPropertyValueSchema> {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return failure({
      message: 'Object is required for validation',
      type: 'ValidationError',
    });
  }

  const input = obj as Record<string, unknown>;

  // Build normalized object with proper typing from the start
  // We'll validate and assign each field explicitly

  // Handle intent_score - coerce string to number if needed
  let intent_score: number;
  if (!('intent_score' in input)) {
    return failure({
      message: 'Missing required field: intent_score',
      type: 'ValidationError',
    });
  }

  const scoreValue = input.intent_score;
  if (typeof scoreValue === 'string') {
    const parsed = parseFloat(scoreValue);
    if (isNaN(parsed)) {
      return failure({
        message: `intent_score "${scoreValue}" cannot be converted to a number`,
        type: 'ValidationError',
      });
    }
    intent_score = parsed;
    logger.debug(`Coerced intent_score from string to number: ${scoreValue} -> ${parsed}`);
  } else if (typeof scoreValue === 'number') {
    intent_score = scoreValue;
  } else {
    return failure({
      message: `intent_score must be a number or numeric string, got ${typeof scoreValue}`,
      type: 'ValidationError',
    });
  }

  // Validate range
  if (intent_score < 0 || intent_score > 100) {
    return failure({
      message: 'intent_score must be between 0 and 100',
      type: 'ValidationError',
    });
  }

  // Handle intent_trigger - coerce string to boolean if needed
  let intent_trigger: boolean;
  if (!('intent_trigger' in input)) {
    return failure({
      message: 'Missing required field: intent_trigger',
      type: 'ValidationError',
    });
  }

  const triggerValue = input.intent_trigger;
  if (typeof triggerValue === 'string') {
    const lowerTrigger = triggerValue.toLowerCase().trim();
    if (lowerTrigger === 'true' || lowerTrigger === '1') {
      intent_trigger = true;
      logger.debug(`Coerced intent_trigger from string to boolean: ${triggerValue} -> true`);
    } else if (lowerTrigger === 'false' || lowerTrigger === '0') {
      intent_trigger = false;
      logger.debug(`Coerced intent_trigger from string to boolean: ${triggerValue} -> false`);
    } else {
      return failure({
        message: `intent_trigger "${triggerValue}" cannot be converted to boolean`,
        type: 'ValidationError',
      });
    }
  } else if (typeof triggerValue === 'boolean') {
    intent_trigger = triggerValue;
  } else if (typeof triggerValue === 'number') {
    intent_trigger = triggerValue !== 0;
    logger.debug(`Coerced intent_trigger from number to boolean: ${triggerValue} -> ${intent_trigger}`);
  } else {
    return failure({
      message: `intent_trigger must be a boolean or boolean-like value, got ${typeof triggerValue}`,
      type: 'ValidationError',
    });
  }

  // Handle string fields with proper typing
  const stringFields = [
    'context_summary',
    'context_description',
    'timestamp',
    'source',
    'version'
  ] as const;

  // Create a partial object that we'll fill in
  const stringValues: Partial<Record<typeof stringFields[number], string>> = {};

  for (const field of stringFields) {
    if (!(field in input)) {
      return failure({
        message: `Missing required field: ${field}`,
        type: 'ValidationError',
      });
    }

    const value = input[field];
    if (value === null || value === undefined) {
      return failure({
        message: `Field '${field}' cannot be null or undefined`,
        type: 'ValidationError',
      });
    }

    if (typeof value !== 'string') {
      stringValues[field] = String(value);
      logger.debug(`Coerced ${field} from ${typeof value} to string: ${value} -> ${stringValues[field]}`);
    } else {
      stringValues[field] = value;
    }
  }

  // Now we can safely construct the final object with all fields verified
  const normalized: IntentPropertyValueSchema = {
    intent_score,
    intent_trigger,
    context_summary: stringValues.context_summary!,
    context_description: stringValues.context_description!,
    timestamp: stringValues.timestamp!,
    source: stringValues.source!,
    version: stringValues.version!,
  };

  return success(normalized);
}

/**
 * Lightweight validation without coercion - use this if you want strict validation
 */
export function validateIntentPropertySchema(
    obj: unknown,
): Result<IntentPropertyValueSchema> {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return failure({
      message: 'Object is required for validation',
      type: 'ValidationError',
    });
  }

  const typedObj = obj as Record<string, unknown>;

  // Strict type checking without coercion
  type RequiredField = {
    name: keyof IntentPropertyValueSchema;
    type: 'string' | 'number' | 'boolean';
  };

  const requiredFields: RequiredField[] = [
    { name: 'intent_score', type: 'number' },
    { name: 'intent_trigger', type: 'boolean' },
    // { name: 'context_summary', type: 'string' },
    // { name: 'context_description', type: 'string' },
    // { name: 'timestamp', type: 'string' },
    // { name: 'source', type: 'string' },
    // { name: 'version', type: 'string' },
  ];

  for (const field of requiredFields) {
    if (!(field.name in typedObj)) {
      return failure({
        message: `Missing required field: ${field.name}`,
        type: 'ValidationError',
      });
    }

    if (typeof typedObj[field.name] !== field.type) {
      return failure({
        message: `Field '${field.name}' must be of type ${field.type}, got ${typeof typedObj[field.name]}`,
        type: 'ValidationError',
      });
    }
  }

  const intentScore = typedObj.intent_score as number;
  if (intentScore < 0 || intentScore > 100) {
    return failure({
      message: 'intent_score must be between 0 and 100',
      type: 'ValidationError',
    });
  }

  return success(typedObj as unknown as IntentPropertyValueSchema);
}