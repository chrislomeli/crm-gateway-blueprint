/**
 * Pure business logic functions for event filtering
 *
 * These functions contain no external dependencies and are easy to unit test.
 */





/**
 * Checks if an intent trigger value is valid for processing
 *
 * @param trigger The intent trigger value to validate
 * @returns true if the trigger is valid (not null or undefined)
 */
export function isValidIntentTrigger(trigger: unknown): boolean {
  return trigger !== null && trigger !== undefined;
}
