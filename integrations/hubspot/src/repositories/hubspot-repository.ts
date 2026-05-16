/**
 * Repository for all HubSpot API operations
 * Simple wrapper around HubSpot SDK calls
 */

import { TokenManager } from '../utils';
import {
  HubspotContact,
  HubspotDeal,
  HubspotPageResponse,
  OAuth
} from '../types';
import {Result, tryResultAsync, AppErrorType, getErrorInfo} from '@platform/core';
import { IContactRepository } from './contact-repository.interface';
import { DbRepository } from './db-repository';
import {CONFIG, ConfigProvider} from '@platform/configuration';
import { DateTime } from 'luxon';
import { createHttpClient } from '@platform/connectors';

interface CachedAuth {
  oauth: OAuth;
  cachedAt: DateTime;
  expiresAt: DateTime;
}

export class HubSpotRepository implements IContactRepository {

  private tokenManager: TokenManager;
  private httpClient: ReturnType<typeof createHttpClient> | null = null;
  private name = 'HubSpotRepository';
  private dbRepository: DbRepository;
  
  // Caching state
  private hubspotConfig: any = null;
  private cachedAuth: CachedAuth | null = null;
  private portalId: number | null = null;
  private businessId: number | null = null;
  private isInitialized = false;

  constructor(portalId?: number, businessId?: number) {
    this.tokenManager = new TokenManager();
    this.dbRepository = new DbRepository();
    this.portalId = portalId || null;
    this.businessId = businessId || null;
  }

  /**
   * JIT initialization - loads and validates HubSpot configuration
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load and validate HubSpot configuration
      this.hubspotConfig = {
        clientId: ConfigProvider.get(CONFIG.HUBSPOT_CLIENT_ID),
        clientSecret: ConfigProvider.get(CONFIG.HUBSPOT_CLIENT_SECRET),
        redirectUri: ConfigProvider.get(CONFIG.HUBSPOT_REDIRECT_URI),
        loginUri: ConfigProvider.get(CONFIG.HUBSPOT_LOGIN_URI)
      };

      // Validate required config
      if (!this.hubspotConfig.clientId || !this.hubspotConfig.clientSecret) {
        throw new Error('Missing required HubSpot configuration: clientId and clientSecret are required');
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize HubSpot configuration: ${getErrorInfo(error).message}`);
    }
  }

  /**
   * Check if cached auth is still valid
   */
  private isCachedAuthValid(): boolean {
    if (!this.cachedAuth) return false;
    
    const now = DateTime.now().toUTC();
    const cacheExpiry = this.cachedAuth.cachedAt.plus({ minutes: 25 }); // Cache for 25 minutes (tokens expire in 30)
    
    return now < cacheExpiry && now < this.cachedAuth.expiresAt;
  }

  /**
   * Ensure we have a valid access token - updated to use caching
   */
  async ensureValidToken(portalId?: number, businessId?: number): Promise<OAuth> {
    // Use provided IDs or fall back to constructor values
    const targetPortalId = portalId || this.portalId;
    const targetBusinessId = businessId || this.businessId;
    
    if (!targetPortalId || !targetBusinessId) {
      throw new Error('Portal ID and Business ID are required for token validation');
    }

    // Initialize if needed
    await this.initialize();

    // Check if we have valid cached auth for the same portal/business
    if (this.cachedAuth && 
        this.cachedAuth.oauth.businessId === targetBusinessId && 
        this.isCachedAuthValid()) {
      
      // Update httpClient with cached token
      this.httpClient = createHttpClient({
        baseUrl: 'https://api.hubapi.com',
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${this.cachedAuth.oauth.accessToken}`,
          'Content-Type': 'application/json'
        },
        retries: 3,
        circuitBreaker: true
      });
      return this.cachedAuth.oauth;
    }

    // Need to fetch/refresh auth
    const authResult = await this.getAuthorization(targetPortalId, targetBusinessId);
    
    if (!authResult.success) {
      const errorInfo = getErrorInfo(authResult);
      throw new Error(`Failed to get authorization: ${errorInfo.message}`);
    }

    const oauth = authResult.data;
    
    // Cache the auth data
    const tokenExpiry = oauth.tokenvaliduntil 
      ? (oauth.tokenvaliduntil instanceof Date 
          ? oauth.tokenvaliduntil 
          : new Date(oauth.tokenvaliduntil))
      : new Date();
      
    this.cachedAuth = {
      oauth,
      cachedAt: DateTime.now().toUTC(),
      expiresAt: DateTime.fromJSDate(tokenExpiry)
    };

    // Update httpClient
    this.httpClient = createHttpClient({
      baseUrl: 'https://api.hubapi.com',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'Content-Type': 'application/json'
      },
      retries: 3,
      circuitBreaker: true
    });
    
    return oauth;
  }

  /**
   * Get authorization data for HubSpot operations
   * Handles OAuth token lookup, validation, and refresh
   * Separates database operations from HTTP calls
   */
  async getAuthorization(portalId: number, businessId: number): Promise<Result<OAuth>> {
    return tryResultAsync(
      async () => {
        // 1. Get OAuth data from database using modernized repository
        const oauthData = await this.dbRepository.getOAuthTokenByBusinessAndPortal(businessId, portalId);
        
        if (!oauthData) {
          throw new Error(`No OAuth data found for portalId=${portalId}, businessId=${businessId}`);
        }

        // 2. Check if we need to refresh the access token
        let needsRefresh = true;
        
        if (oauthData.accessToken && oauthData.tokenvaliduntil) {
          const tokenExpirationTime = DateTime.fromJSDate(new Date(oauthData.tokenvaliduntil));
          const now = DateTime.now().toUTC();
          needsRefresh = tokenExpirationTime.toMillis() <= now.toMillis();
        }

        // 3. If token needs refresh, delegate to HTTP service (separated concern)
        if (needsRefresh) {
          const refreshedTokens = await this.refreshAccessToken(oauthData.token);
          
          // 4. Update database with new tokens
          const updateResult = await this.dbRepository.updateUserCrmTokens(
            oauthData.userid,
            16, // HubSpot CRM ID
            refreshedTokens.accessToken,
            refreshedTokens.expiresAt
          );
          
          if (!updateResult.success) {
            const errorInfo = getErrorInfo(updateResult);
            throw new Error(`Failed to update tokens in database: ${errorInfo.message}`);
          }

          // 5. Return updated OAuth object
          return {
            businessid: oauthData.businessid,
            businessId: oauthData.businessid,
            token: oauthData.token,
            apiKey: oauthData.apiKey,
            accessToken: refreshedTokens.accessToken,
            tokenvaliduntil: new Date(refreshedTokens.expiresAt),
            _lookupMethod: oauthData._lookupMethod
          };
        }

        // 6. Token is still valid, return existing data
        return {
          businessid: oauthData.businessid,
          businessId: oauthData.businessid,
          token: oauthData.token,
          apiKey: oauthData.apiKey,
          accessToken: oauthData.accessToken,
          tokenvaliduntil: oauthData.tokenvaliduntil,
          _lookupMethod: oauthData._lookupMethod
        };
      },
      AppErrorType.AUTHENTICATION_ERROR,
      {
        operation: 'getAuthorization',
        data: { portalId, businessId }
      }
    );
  }

  /**
   * Refresh HubSpot access token using httpClient
   */
  private async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
    // Ensure we're initialized (config is cached)
    await this.initialize();
    
    // Use cached configuration
    const { clientId, clientSecret, redirectUri } = this.hubspotConfig;

    // Prepare refresh token request
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      refresh_token: refreshToken
    });

    // Create httpClient for token refresh
    const tokenHttpClient = createHttpClient({
      baseUrl: 'https://api.hubapi.com',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      retries: 2,
      circuitBreaker: true
    });

    const result = await tokenHttpClient.post('/oauth/v1/token', params.toString());

    if (!result.success) {
      throw new Error(`HubSpot token refresh failed: ${result.error.message}`);
    }

    const tokenData = result.data as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    
    // Calculate expiration time (HubSpot tokens typically expire in 30 minutes)
    const ACCESS_TOKEN_TTL_SECONDS = 1800; // 30 minutes
    const expirationTime = DateTime.now()
      .plus({ seconds: ACCESS_TOKEN_TTL_SECONDS })
      .toUTC()
      .toISO();

    return {
      accessToken: tokenData.access_token,
      expiresAt: expirationTime
    };
  }

  /**
   * Transform API response contact to our custom type
   */
  private transformContact(apiContact: any): HubspotContact {
    return {
      id: apiContact.id,
      properties: apiContact.properties || {},
      associations: apiContact.associations,
      createdAt: apiContact.createdAt,
      updatedAt: apiContact.updatedAt,
      archived: apiContact.archived || false
    };
  }

  /**
   * Transform API response deal to our custom type
   */
  private transformDeal(apiDeal: any): HubspotDeal {
    return {
      id: apiDeal.id,
      properties: apiDeal.properties || {},
      associations: undefined, // Deals don't have associations in this context
      createdAt: apiDeal.createdAt,
      updatedAt: apiDeal.updatedAt,
      archived: apiDeal.archived || false
    };
  }

  /**
   * Transform API page response to our custom type
   */
  private transformPageResponse<T>(
    apiResponse: any,
    transformer: (item: any) => T
  ): HubspotPageResponse<T> {
    return {
      results: apiResponse.results?.map(transformer) || [],
      paging: apiResponse.paging ? {
        next: apiResponse.paging.next ? {
          after: apiResponse.paging.next.after,
          link: apiResponse.paging.next.link
        } : undefined
      } : undefined
    };
  }

  // Legacy method - kept for backward compatibility but deprecated
  async ensureValidTokenLegacy(oauth: OAuth): Promise<void> {
    oauth.accessToken = await this.tokenManager.ensureValidToken(oauth);
    this.httpClient = createHttpClient({
      baseUrl: 'https://api.hubapi.com',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'Content-Type': 'application/json'
      },
      retries: 3,
      circuitBreaker: true
    });
  }

  /**
   * Get a page of contacts with optional associations using REST API
   */
  async getContactsPage(params: {
    portalId?: number;
    businessId?: number;
    after?: string;
    limit?: number;
    properties?: string[];
    associations?: string[];
  }): Promise<HubspotPageResponse<HubspotContact>> {
    const { after = '0', limit = 100, properties = [], associations = [] } = params;

    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      after,
      archived: 'false'
    });

    if (properties.length > 0) {
      properties.forEach(prop => queryParams.append('properties', prop));
    }

    if (associations.length > 0) {
      associations.forEach(assoc => queryParams.append('associations', assoc));
    }

    const result = await this.httpClient.get(`/crm/v3/objects/contacts?${queryParams.toString()}`);

    if (!result.success) {
      throw new Error(`Failed to get contacts page: ${result.error.message}`);
    }

    return this.transformPageResponse(result.data, (contact) => this.transformContact(contact));
  }

  /**
   * Get specific contacts by IDs using REST API
   */
  async getContactsByIds(params: {
    ids: string[];
    properties?: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<Result<HubspotContact[]>> {
    return tryResultAsync(
      async () => {
        const { ids, properties = [] } = params;

        if (ids.length === 0) {
          return [];
        }

        // Ensure valid token and httpClient
        await this.ensureValidToken(params.portalId, params.businessId);

        if (!this.httpClient) {
          throw new Error('HTTP client not initialized');
        }

        const batchReadInput = {
          propertiesWithHistory: [],
          idProperty: 'hs_object_id',
          inputs: ids.map(id => ({ id })),
          properties,
          archived: false
        };

        const result = await this.httpClient.post('/crm/v3/objects/contacts/batch/read', batchReadInput);

        if (!result.success) {
          throw new Error(`Failed to get contacts by IDs: ${result.error.message}`);
        }

        return result.data.results.map((contact: any) => this.transformContact(contact));
      },
      AppErrorType.UPSTREAM_ERROR,
      {
        operation: 'getContactsByIds',
        data: { idsCount: params.ids.length, propertiesCount: params.properties?.length || 0 }
      }
    );
  }

  /**
   * Get associations between objects using REST API
   */
  async getBatchAssociations(params: {
    fromObjectType: string;
    toObjectType: string;
    ids: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<Record<string, any[]>> {
    const { fromObjectType, toObjectType, ids } = params;

    if (ids.length === 0) {
      return {};
    }

    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    const batchInput = {
      inputs: ids.map(id => ({ id }))
    };

    const result = await this.httpClient.post(
      `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/read`,
      batchInput
    );

    if (!result.success) {
      throw new Error(`Failed to get batch associations: ${result.error.message}`);
    }

    // Transform response into a map
    const associationsMap: Record<string, any[]> = {};
    result.data.results?.forEach((result: any) => {
      const fromId = result._from?.id;
      if (fromId && result.to?.length > 0) {
        associationsMap[fromId] = result.to;
      }
    });

    return associationsMap;
  }

  /**
   * Get deals by IDs using REST API
   */
  async getDealsByIds(params: {
    ids: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotDeal[]> {
    const { ids } = params;

    if (ids.length === 0) {
      return [];
    }

    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    const batchReadInput = {
      propertiesWithHistory: [],
      idProperty: 'hs_object_id',
      inputs: ids.map(id => ({ id })),
      properties: [
        'dealname', 'pipeline', 'dealstage', 'amount',
        'closedate', 'createdate', 'hs_lastmodifieddate',
        'hubspot_owner_id'
      ],
      archived: false
    };

    const result = await this.httpClient.post('/crm/v3/objects/deals/batch/read', batchReadInput);

    if (!result.success) {
      throw new Error(`Failed to get deals by IDs: ${result.error.message}`);
    }

    return result.data.results.map((deal: any) => this.transformDeal(deal));
  }


  /**
   * Get a single contact by ID using REST API
   */
  async getContactById(params: {
    contactId: string;
    properties: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotContact | null> {
    const { contactId, properties } = params;
    
    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      // Build query parameters
      const queryParams = new URLSearchParams({
        archived: 'false'
      });

      properties.forEach(prop => queryParams.append('properties', prop));
      queryParams.append('associations', 'companies');
      queryParams.append('associations', 'deals');

      const result = await this.httpClient.get(`/crm/v3/objects/contacts/${contactId}?${queryParams.toString()}`);

      if (!result.success) {
        if (result.error.statusCode === 404) {
          return null; // Contact doesn't exist in this account
        }
        throw new Error(`Failed to get contact by ID: ${result.error.message}`);
      }


      return this.transformContact(result.data);

    } catch (error: any) {
      if (error.message?.includes('404') || error.statusCode === 404) {
        return null; // Contact doesn't exist in this account
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Get associations for a single contact using REST API
   */
  async getContactAssociations(params: {
    contactId: number;
    toObjectType: string;
    portalId?: number;
    businessId?: number;
  }): Promise<number[]> {
    const { contactId, toObjectType } = params;
    
    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      const queryParams = new URLSearchParams({
        limit: '500'
      });

      const result = await this.httpClient.get(
        `/crm/v4/objects/contact/${contactId}/associations/${toObjectType}?${queryParams.toString()}`
      );
      
      if (!result.success) {
        if (result.error.statusCode === 404) {
          return []; // No associations found
        }
        throw new Error(`Failed to get contact associations: ${result.error.message}`);
      }
      
      return result.data.results?.map((assoc: any) => assoc.toObjectId) || [];
    } catch (error: any) {
      if (error.message?.includes('404') || error.statusCode === 404) {
        return []; // No associations found
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Search for contacts with filters using REST API
   */
  async searchContacts(params: {
    filters: any[];
    properties?: string[];
    limit?: number;
    after?: string;
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotPageResponse<HubspotContact>> {
    const { filters, properties = [], limit = 100, after = '0' } = params;

    // Ensure valid token and httpClient
    await this.ensureValidToken(params.portalId, params.businessId);

    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    const searchRequest = {
      filterGroups: [{ filters }],
      properties,
      limit,
      after: parseInt(after, 10), // Convert string to number as required by API
      sorts: [] // Required by HubSpot API
    };

    const result = await this.httpClient.post('/crm/v3/objects/contacts/search', searchRequest);

    if (!result.success) {
      throw new Error(`Failed to search contacts: ${result.error.message}`);
    }

    return this.transformPageResponse(result.data, (contact) => this.transformContact(contact));
  }
}
