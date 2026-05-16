/**
 * contactRecord.ts – Standard contact structure used by batch processing
 */
import { CrmRecord } from './crmRecord';

/**
 * ContactRecord extends the base CrmRecord interface
 * This maintains backward compatibility while following the new standardization
 */
export interface ContactRecord extends CrmRecord {
  // ContactRecord now inherits all fields from CrmRecord
  // Additional contact-specific fields can be added here if needed
} 