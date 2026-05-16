/**
 * TypeScript type definitions for HubSpot sync
 */

// Legacy type - kept for backward compatibility
export interface THubspotWebhookRequest {
  test?: any;
  userId?: number;
  crmID?: string;
  ids?: string[];
  portalid?: string;
  contactSyncId?: string;
  processedCounter: number;
  contactCounter: number;
  hasMore?: boolean;
  offset: string;
  oauth: OAuth;
  externalOwnersToacmeUsersMap?: Record<string, string>;
  recursionCounter?: number;
}

// Separate types for different sync operations
export interface FullSyncRequest {
  businessId: number;
  userId: number;
  portalId: string;
  contactSyncId: number; // Required for full sync tracking
  oauth: OAuth;
  processedCounter?: number;
  offset?: string;
}

export interface SpecificContactsSyncRequest {
  businessId: number;
  portalId: number;
  ids: number[]; // Required for specific contacts
  oauth: OAuth;
}

export interface OAuth {
  businessid: number;
  businessId?: number;
  accessToken?: string;
  token: string;
  apiKey?: string;
  tokenvaliduntil?: Date | string;
}

// Temporary stubs removed - now using real implementations from intents module

export interface HubspotContact {
  id: string;
  properties: Record<string, any>;
  associations?: {
    deals?: {
      results: Array<{
        id: string;
        type: string;
      }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface HubspotDeal {
  id: string;
  properties: Record<string, any>;
  associations?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface HubspotPageResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
      link?: string;
    };
  };
}

export interface SyncResult {
  completed: boolean;
  processedCount: number;
  error?: string;
}

export interface TransformedContact {
  acmecrmid: string;
  crmname: string;
  businessid: number;
  externalid: number;
  created_at: string;
  name: {
    firstName?: string;
    lastName?: string;
  };
  company: {
    id?: string;
    name?: string;
  };
  emails: Array<{
    type: string;
    email: string;
  }>;
  phones: Array<{
    type: string;
    phone: string;
  }>;
  phone164: Array<{
    type: string;
    phone: string;
    original?: string;
  }>;
  addresses: Array<{
    type: string;
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  }>;
  crmlinks: {
    weblink?: string;
  };
  deals: any;
  ownerid: string;
  acmeownerid: string;
  rawContact?: HubspotContact;
  rawDeals?: HubspotDeal[];
}
