/**
 * StringOffset.ts - Offset Tracking for Batch Processing
 *
 * This file defines types and classes for tracking offsets in batch processing repositories.
 * StringOffset provides a way to track progress using string-based identifiers.
 *
 * What does this file do?
 * - Defines the Offset interface and StringOffset class
 * - Enables tracking of batch progress with string offsets
 *
 * How do you use it?
 * - Use StringOffset to track your batch job progress
 * - Extend or implement Offset for custom offset types
 *
 * Why is this important?
 * - Standardizes offset tracking for batch repositories
 * - Helps new developers understand how progress is managed
 *
 * @module common/framework/batch/models/StringOffset
 */
/**
 * Interface for offset tracking
 */
export interface Offset<T> {
  value: T;
  compare(other: Offset<T>): number;
  toString(): string;
}

/**
 * String-based offset implementation
 * Used for tracking batch processing progress using string identifiers
 */
export class StringOffset implements Offset<string> {
  /**
   * Creates a new StringOffset
   * @param value String value of the offset
   */
  constructor(public value: string) {}

  /**
   * Get the string value of the offset
   * @returns String value
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Compare this offset with another offset
   * @param other The other offset to compare with
   * @returns -1 if this < other, 0 if this == other, 1 if this > other
   */
  compare(other: Offset<string>): number {
    if (!(other instanceof StringOffset)) {
      throw new Error('Cannot compare StringOffset with different offset type');
    }
    
    const thisNum = parseInt(this.value, 10);
    const otherNum = parseInt(other.value, 10);
    
    if (isNaN(thisNum) || isNaN(otherNum)) {
      // If not numeric, compare as strings
      return this.value.localeCompare(other.value);
    }
    
    // Compare as numbers
    if (thisNum < otherNum) return -1;
    if (thisNum > otherNum) return 1;
    return 0;
  }

  /**
   * Convert the offset to a string
   * @returns String representation of the offset
   */
  toString(): string {
    return this.value;
  }
}
