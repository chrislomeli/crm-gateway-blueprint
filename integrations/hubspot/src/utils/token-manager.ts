/**
 * Manage OAuth tokens for HubSpot API
 * Handles token refresh and caching
 */

import { DateTime } from 'luxon';
import { z } from 'zod';
import { DbRepository } from '../repositories';
import {getErrorInfo, logger} from '@platform/core';
import { OAuth } from '../types';
import {CONFIG, ConfigProvider} from "@platform/configuration";
import { createHttpClient } from '@platform/connectors';

// Zod schema for HubSpot configuration validation
const HubSpotConfigSchema = z.object({
  hubspotClientId: z.string().min(1, 'HubSpot Client ID is required'),
  hubspotClientSecret: z.string().min(1, 'HubSpot Client Secret is required'),
  hubspotRedirectUri: z.string().url('HubSpot Redirect URI must be a valid URL').optional(),
  redirectUri: z.string().url('Redirect URI must be a valid URL').optional(),
}).refine(
  (data) => data.hubspotRedirectUri || data.redirectUri,
  {
    message: 'Either hubspotRedirectUri or redirectUri must be provided',
    path: ['redirectUri']
  }
);

type HubSpotConfig = z.infer<typeof HubSpotConfigSchema>;

export class TokenManager {
  private dbRepo: DbRepository;
  private tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();
  private hubspotConfig: HubSpotConfig;

  constructor() {
    this.dbRepo = new DbRepository();
    this.hubspotConfig = ConfigProvider.get(CONFIG.HUBSPOT_CLIENT_INFO);

    if (!this.hubspotConfig) {
      throw new Error('HubSpot config not found');
    }

    // Validate config with Zod
    const parseResult = HubSpotConfigSchema.safeParse(this.hubspotConfig);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw new Error(`HubSpot config validation failed: ${errorMessages}`);
    }

    this.hubspotConfig = parseResult.data;
  }

  /**
   * Get OAuth token from database by businessId and portalId
   */
  async getOAuthByBusinessAndPortal(businessId: number, portalId: number): Promise<OAuth | null> {
    try {
      // Look up the OAuth token from userCRM table
      const oauthData = await this.dbRepo.getOAuthTokenByBusinessAndPortal(businessId, portalId);
      return oauthData;
    } catch (error) {
      logger.error({ 
        error: getErrorInfo(error).message,
        businessId, 
        portalId 
      }, 'Failed to get OAuth token from database');
      return null;
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary
   */
  async ensureValidToken(oauth: OAuth): Promise<string> {
    const cacheKey = `${oauth.businessid}-${oauth.token}`;
    
    // Check cache first
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    // Check if current token is still valid
    if (oauth.accessToken && oauth.tokenvaliduntil) {
      const tokenExpiry = new Date(oauth.tokenvaliduntil);
      if (tokenExpiry > new Date()) {
        // Cache the valid token
        this.tokenCache.set(cacheKey, {
          token: oauth.accessToken,
          expiresAt: tokenExpiry
        });
        return oauth.accessToken;
      }
    }

    // Need to refresh the token
    return await this.refreshToken(oauth);
  }

  /**
   * Refresh the OAuth token using httpClient
   */
  private async refreshToken(oauth: OAuth): Promise<string> {
    if (!oauth.token) {
      throw new Error('Missing refresh token');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.hubspotConfig.hubspotClientId,
      client_secret: this.hubspotConfig.hubspotClientSecret,
      redirect_uri: this.hubspotConfig.redirectUri!,
      refresh_token: oauth.token
    });

    // Create httpClient for HubSpot OAuth API
    const httpClient = createHttpClient({
      baseUrl: 'https://api.hubapi.com',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      retries: 2,
      circuitBreaker: true
    });

    try {
      const result = await httpClient.post('/oauth/v1/token', params.toString());

      if (!result.success) {
        logger.error({ 
          error: getErrorInfo(result.error).message,
          businessId: oauth.businessid 
        }, 'Failed to refresh token');
        throw new Error(`Token refresh failed: ${result.error.message}`);
      }

      const { access_token } = result.data;
      
      // Calculate expiration (30 minutes from now, with 1 minute buffer)
      const expiresAt = DateTime.now().plus({ minutes: 29 }).toJSDate();

      // Update database
      await this.updateTokenInDatabase(
        oauth.businessid,
        access_token,
        expiresAt
      );

      // Cache the new token
      const cacheKey = `${oauth.businessid}-${oauth.token}`;
      this.tokenCache.set(cacheKey, {
        token: access_token,
        expiresAt
      });

      logger.info({ 
        businessId: oauth.businessid 
      }, 'Token refreshed successfully');

      return access_token;

    } catch (error) {
      logger.error({ 
        error: getErrorInfo(error).message,
        businessId: oauth.businessid 
      }, 'Failed to refresh token');
      throw error;
    }
  }

  /**
   * Update token in database
   */
  private async updateTokenInDatabase(
    businessId: number,
    accessToken: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      await this.dbRepo.updateUserCrmTokens(
        null, // userId will be determined by businessId
        16, // HubSpot CRM ID
        accessToken,
        expiresAt.toISOString()
      );
    } catch (error) {
      logger.error({ 
        error: getErrorInfo(error).message,
        businessId 
      }, 'Failed to update token in database');
      // Don't throw - we have the token, just couldn't persist it
    }
  }

  /**
   * Clear token cache
   */
  clearCache(): void {
    this.tokenCache.clear();
  }
}
