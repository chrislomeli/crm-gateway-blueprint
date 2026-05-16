import {Intent, IntentPropertyValueSchema} from "./intent.types";

export interface HubspotUpdateEvent {
  eventId: string; // unique id
  subscriptionId?: number;
  portalId: number; // account identifier
  appId?: number;
  occurredAt: number; // we do get a timestamp
  subscriptionType: string; // this is the operation we need to perform
  objectId: number; // hubspot contact id
  propertyName?: string; // The fieldName that changed
  propertyValue?: string; // The value it changed to
  parsedValue?: IntentPropertyValueSchema; // The value it changed to
  changeSource?: string; // Housekeeping
  eventIdSignature?: string; // Housekeeping
  attemptNumber?: number; // Housekeeping
  eventSpanId?: string; // Housekeeping
  parentTraceId?: string; // Housekeeping
}

type EntityType = 'contact' | 'deal' | 'company' | 'unknown';

type SubscriptionType = string; // Could be more specific if you have a known set

// Nested grouping structure types
type EventsBySubscriptionType = Record<SubscriptionType, HubspotUpdateEvent[]>;
type EventsByObjectId = Record<number, EventsBySubscriptionType>;
type EventsByPortalId = Record<number, EventsByObjectId>;

export interface ContactEvent {
  portalId: number;
  objectId: number;
  parentTraceId: string;
  contactTraceId: string;
  subscriptionType: string;
}

 export interface HubspotSQSWebhookMessage extends ContactEvent {
  contactEvents: HubspotUpdateEvent[];
  eventCount: number;
  queueType: 'import' | 'single';
  entity: string; // 'contact' | 'deal' | 'company'
  type: string; // 'new' | 'modified' | 'delete'
}


//export interface IntentPayload extends HubspotSQSWebhookMessage {} ;

export interface CacheHitResult {
  intent: Intent;
  updateEvent: HubspotUpdateEvent;
}

export interface ContactMetaData {
  lastUpdated: Date;
  source: string;
  traceId: string;
}


export interface ContactRecord {
  acmecrmid?: string |number; // May be missing
  deals?: {
    id?: string; // Deal structure may vary
    title?: string;
  }[];
  crmname?: string;
  businessid: string | number; // May be missing
  externalid: string | number; // May be missing
  crmid: string | number; // May be missing
  phone164?: PhoneRecord[];
  [key: string]: unknown; // Allow other dynamic fields
}

export interface ContactInfo {
  _index: string; // Always present from ES
  _type?: string; // Optional in newer ES versions
  _id: string; // Always present from ES
  _score?: number; // May not be present in some queries
  _source?: {
    acmecrmid?: number; // May be missing
    deals?: {
      id?: string; // Deal structure may vary
      title?: string;
    }[];
    crmname?: string;
    businessid: string; // May be missing
    externalid: string; // May be missing
    acme: string; // May be missing but important for your logic
    ownerid: string; // May be missing but important for your logic
    phone164?: PhoneRecord[];
    [key: string]: unknown; // Allow other dynamic fields
  };
  fields?: {
    calculated_id?: string[]; // Script fields may not execute
    [key: string]: unknown; // Allow other computed fields
  };
  found?: boolean
}



export interface OpensearchGetResponse {
  success: boolean;
  data: ContactInfo
}

// Extended ContactInfo that includes the 'found' field from ES responses
export interface ContactInfoWithFound extends ContactInfo {
  found: boolean;
}

export interface PhoneRecord {
  regionCode: string;
  phone: string;
  countryCode: number;
  type: string;
}
