/**
 * Results Module
 * 
 * This module provides a comprehensive system for handling operation results and errors.
 * It implements the Result pattern for explicit error handling without exceptions.
 */

// Export all types
export * from './types';

// Export all utility functions
export * from './functions';


// Create a namespace for backward compatibility and convenience
import * as Functions from './functions';

/**
 * Result namespace for convenient access to all functions
 */
export const Results = {
  ...Functions,
};
