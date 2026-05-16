import {PhoneRecord} from "./webhook.types";

export interface Intent {
  businessid: number;
  portalId: number;
  intentFieldName: string;
  intentScoreThreshold: number;
  intentFieldLabel?: string;
}

export interface IntentPropertyValueSchema {
  intent_score: number;
  intent_trigger: boolean;
  context_summary: string;
  context_description: string;
  timestamp: string;
  source: string;
  version: string;
}

export interface CacheMetadata {
  lastUpdated: number;
  version: string;
}

export interface AIOContactInfo {
  id: string;
  acmecrmid: string;
  crmname: string;
  businessid: string;
  externalid: number;
  ownerid: string;
  acmeownerid: string;
  phone164?: PhoneRecord[];
  [key: string]: unknown;
}

export interface DbData {
  // intent and businessDetails information
  intentId: number; // intent table row identifier
  intentDate: string; // original date of this intent - could be older if we were waiting for a userid
  fromState: string; // previous state in the intent processing workflow - WAIT means that we found an owner later
  userResolution: string; // could we resolve the owner to a userid
  intentScoreThreshold: number; // businessDetails minimum score threshold set by the bid
  intentFieldName: string; // businessDetails intentFieldName set by the bid
}

export interface AIODecisionRequest {
  globalTraceId: string;
  esContactData: AIOContactInfo;
  dbData: DbData;
  webhookParameterValue: IntentPropertyValueSchema;
}

// Signal score constants
export const SignalScore = {
  FAIL: 'FAIL',
  WAIT: 'WAIT',
  FORWARD: 'FORWARD',
  NOOP: 'NOOP',
} as const;

// Type for signal score
export type SignalScoreType = (typeof SignalScore)[keyof typeof SignalScore];

export interface IntentVote {
  user_id: number;
  stats: string[];
  score: SignalScoreType;
}

/**
 * Interface for intent record from database
 */
export interface IntentRecord {
  intentId: number;
  globalTraceId: string;
  portalId: number;
  businessid: number;
  userid: number | null;
  externalContactId: string;
  crmID: number;
  intentInfo: string; // JSON string containing intent details
  signalStatus: string;
  signalOutcome: string; // JSON string containing outcome details
  createDate: string; // ISO date string
  updateDate: string; // ISO date string
}

