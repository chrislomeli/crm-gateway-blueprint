/**
 * validationResult.ts - Validation Result Model
 *
 * This file defines the ValidationResult interface and related types for representing the outcome of batch file validation.
 * It structures how validation results, details, and error information are conveyed in the framework.
 *
 * What does this file do?
 * - Defines ValidationResult and related types
 * - Standardizes validation outcome reporting for batch files
 *
 * How do you use it?
 * - Use ValidationResult to represent and check validation outcomes
 * - Extend for custom validation requirements
 *
 * Why is this important?
 * - Ensures consistent validation logic and reporting
 * - Helps new developers understand how validation fits into the batch process
 *
 * @module common/framework/batch/models/validationResult
 */
/**
 * ValidationResult model
 * 
 * Represents the result of validating a batch file
 */

/**
 * Validation result interface
 */
export interface ValidationResult {
  /**
   * Whether the validation passed
   */
  isValid: boolean;
  
  /**
   * Additional details about the validation
   */
  details: Record<string, any>;
}
