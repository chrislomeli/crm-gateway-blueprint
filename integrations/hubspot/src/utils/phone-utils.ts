/**
 * Phone number utility functions
 * Handles phone number formatting and validation
 */

import { logger } from '@platform/core';

/**
 * Clean and format phone number
 */
export function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 0) {
    return null;
  }

  // Handle US numbers
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // For international numbers, assume they're already properly formatted
  if (cleaned.length > 11) {
    return `+${cleaned}`;
  }

  // If less than 10 digits, it's probably not a valid phone number
  if (cleaned.length < 10) {
    logger.warn({ phone, cleaned }, 'Phone number too short, discarding');
    return null;
  }

  return `+${cleaned}`;
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string | null {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) {
    return null;
  }

  // Remove the + prefix for formatting
  const digits = cleaned.substring(1);

  // Format US numbers as (XXX) XXX-XXXX
  if (digits.length === 11 && digits.startsWith('1')) {
    const areaCode = digits.substring(1, 4);
    const exchange = digits.substring(4, 7);
    const number = digits.substring(7, 11);
    return `(${areaCode}) ${exchange}-${number}`;
  }

  // For other numbers, just return the cleaned version
  return cleaned;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned !== null && cleaned.length >= 11;
}

/**
 * Extract country code from phone number
 */
export function extractCountryCode(phone: string | null | undefined): string | null {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) {
    return null;
  }

  // Remove the + prefix
  const digits = cleaned.substring(1);

  // US/Canada
  if (digits.startsWith('1')) {
    return '1';
  }

  // For other countries, we'd need a more sophisticated lookup
  // For now, just return the first 1-3 digits as a guess
  if (digits.length >= 10) {
    // Try common country code lengths
    for (let len = 1; len <= 3; len++) {
      const code = digits.substring(0, len);
      if (digits.length - len >= 9) { // Ensure remaining digits could be a valid number
        return code;
      }
    }
  }

  return null;
}

/**
 * Convert phone number to E.164 format
 */
export function toE164Format(phone: string | null | undefined): string | null {
  return cleanPhoneNumber(phone);
}
