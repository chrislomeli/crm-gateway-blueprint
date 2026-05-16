/**
 * Database repository for HubSpot sync operations
 * Modernized to use @platform/connectors with Result<> pattern
 */

import { MySQLService, QueryResult } from '@platform/connectors';
import { Result, tryResultAsync, AppErrorType } from '@platform/core';

export class DbRepository {

  /**
   * Get portal information by access token
   * Converted from stored procedure to direct SQL
   */
  async getPortalIdByAccessToken(token: string): Promise<Result<any>> {
    return tryResultAsync(
      async () => {
        // Direct SQL instead of stored procedure: CALL getPortalIdByAccessToken(?)
        const result = await MySQLService.CALLS.query<any>(
          'SELECT * FROM calls.userCRM WHERE token = ? LIMIT 1',
          [token]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database query failed');
        }
        
        return result.rows[0] || null;
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'getPortalIdByAccessToken',
        data: { hasToken: !!token }
      }
    );
  }

  /**
   * Get external owners by business ID
   * TODO: Convert stored procedure to direct SQL
   */
  async getExternalOwnersByBusinessId(businessId: number, crmId: string = '16'): Promise<Result<Record<string, string>>> {
    return tryResultAsync(
      async () => {
        // TODO: Replace with direct SQL from stored procedure logic
        // For now, using a simplified query - needs to match stored procedure behavior
        const result = await MySQLService.CALLS.query<any>(
          'SELECT userid, externalOwnerid FROM calls.externalOwners WHERE businessId = ? AND crmId = ?',
          [businessId, crmId]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database query failed');
        }
        
        const map: Record<string, string> = {};
        result.rows.forEach((record: any) => {
          if (record.externalOwnerid && record.userid) {
            map[record.externalOwnerid] = record.userid.toString();
          }
        });
        
        return map;
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'getExternalOwnersByBusinessId',
        data: { businessId, crmId }
      }
    );
  }

  /**
   * Update powerlist contact owner by business ID and phone
   * TODO: Convert stored procedure to direct SQL
   */
  async updatePowerlistContactOwnerByBusinessIdPhone(
    businessId: string,
    phoneNumber164: string,
    ownerUserId: string | null
  ): Promise<Result<void>> {
    return tryResultAsync(
      async () => {
        if (!businessId || !phoneNumber164) {
          return; // Skip if missing required parameters
        }

        // TODO: Replace with direct SQL from stored procedure logic
        const result = await MySQLService.CALLS.query(
            `update powerlistContact
                        INNER JOIN powerlist on powerlistContact.powerlistId = powerlist.powerlistId
                    set ownerUserId = ?
                    where powerlist.businessId = ?
                      and powerlistContact.phoneNumber164 = ?`,
                  [ownerUserId, businessId, phoneNumber164]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database update failed');
        }
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'updatePowerlistContactOwnerByBusinessIdPhone',
        data: { businessId, hasPhone: !!phoneNumber164, hasOwner: !!ownerUserId }
      }
    );
  }

  /**
   * Check if sync is aborted
   * TODO: Convert stored procedure to direct SQL
   */
  async isSyncAborted(contactSyncId: number): Promise<Result<boolean>> {
    return tryResultAsync(
      async () => {
        if (!contactSyncId) {
          return false;
        }

        // TODO: Replace CALL getCRMContactSync(?) with direct SQL
        const result = await MySQLService.CALLS.query<any>(
          'SELECT status FROM calls.crmContactSync WHERE id = ?',
          [contactSyncId]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database query failed');
        }
        
        const row = result.rows[0];
        return row?.status === 'aborted';
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'isSyncAborted',
        data: { contactSyncId }
      }
    );
  }

  /**
   * Update sync progress
   * TODO: Convert stored procedure to direct SQL
   */
  async updateSyncProgress(contactSyncId: number, count: number): Promise<Result<void>> {
    return tryResultAsync(
      async () => {
        // TODO: Replace CALL updateContactSyncProgress(?,?,?) with direct SQL
        const result = await MySQLService.CALLS.query(
          'UPDATE calls.crmContactSync SET processedCount = ?, lastUpdated = NOW() WHERE id = ?',
          [count, contactSyncId]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database update failed');
        }
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'updateSyncProgress',
        data: { contactSyncId, count }
      }
    );
  }

  /**
   * Update CRM contact sync status
   * TODO: Convert stored procedure to direct SQL
   */
  async updateCRMContactSync(
    contactSyncId: number,
    status: string, 
    errorType: string | null, 
    metadata: string
  ): Promise<Result<void>> {
    return tryResultAsync(
      async () => {
        // TODO: Replace CALL updateCRMContactSync(?,?,?,?) with direct SQL
        const result = await MySQLService.CALLS.query(
          'UPDATE calls.crmContactSync SET status = ?, errorType = ?, metadata = ?, lastUpdated = NOW() WHERE id = ?',
          [status, errorType, metadata, contactSyncId]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database update failed');
        }
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'updateCRMContactSync',
        data: { contactSyncId, status, hasErrorType: !!errorType }
      }
    );
  }

  /**
   * Initiate CRM contact sync
   * TODO: Convert complex stored procedure to direct SQL
   */
  async initiateCRMContactSync(
    userId: number,
    businessId: number,
    initiatorUserId: number,
    crmId: number = 16,
    isTest: boolean = false
  ): Promise<Result<number>> {
    return tryResultAsync(
      async () => {
        // TODO: This stored procedure has complex logic - needs careful conversion
        // For now, simplified implementation
        const result = await MySQLService.CALLS.query(
          `INSERT INTO calls.crmContactSync 
           (userId, businessId, initiatorUserId, crmId, status, isTest, createdAt) 
           VALUES (?, ?, ?, ?, 'started', ?, NOW())`,
          [userId, businessId, initiatorUserId, crmId, isTest]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database insert failed');
        }
        
        const contactSyncId = result.insertId;
        if (!contactSyncId) {
          throw new Error(`Failed to create sync job: no insertId returned for businessId=${businessId}, userId=${userId}`);
        }
        
        return contactSyncId;
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'initiateCRMContactSync',
        data: { userId, businessId, crmId, isTest }
      }
    );
  }

  /**
   * Update user CRM tokens
   * TODO: Convert stored procedure to direct SQL
   */
  async updateUserCrmTokens(
    userId: number | null,
    crmId: number,
    accessToken: string,
    expiresAt: string
  ): Promise<Result<void>> {
    return tryResultAsync(
      async () => {
        // TODO: Replace CALL updateUserCrmTokens2(?,?,?,?) with direct SQL
        const result = await MySQLService.CALLS.query(
            `UPDATE calls.userCRM SET accessToken = ?, tokenvaliduntil = ? WHERE userid = ? AND crmID = ?`,
          [accessToken, expiresAt, userId, crmId]
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Database update failed');
        }
      },
      AppErrorType.DATABASE_ERROR,
      {
        operation: 'updateUserCrmTokens',
        data: { userId, crmId, hasToken: !!accessToken }
      }
    );
  }

  /**
   * Get OAuth token by businessId and portalId
   */
  async getOAuthTokenByBusinessAndPortal(businessId: number, portalId: number): Promise<any> {

      const sql = `SELECT uc.token,
                   uc.accountid,
                   uc.userid,
                   COALESCE(bca.businessid, bu.businessid) as businessid,
                   bca.businessid                          as explicit_businessid,
                   bu.businessid                           as fallback_businessid,
                   CASE
                       WHEN b.apiKeyExpiration IS NULL OR NOW() < b.apiKeyExpiration THEN b.apiKey
                       WHEN b.apiKey2Expiration IS NULL OR NOW() < b.apiKey2Expiration THEN b.apiKey2
                       ELSE NULL
                   END as apiKey
                    FROM calls.userCRM uc
                             LEFT JOIN calls.businessCRMAccount bca ON uc.accountid = bca.accountid
                             LEFT JOIN (SELECT userid, businessId FROM calls.businessusers WHERE isactive = 1) bu ON uc.userid = bu.userid
                             JOIN calls.business b ON COALESCE(bca.businessid, bu.businessid) = b.businessid
                    WHERE uc.accountid = ?
                      AND COALESCE(bca.businessid, bu.businessid) = ?
                      AND uc.isDeleted = 0
                      AND uc.crmID = 16
                    ORDER BY uc.createdate DESC
                    LIMIT 1;`


      const result = await MySQLService.CALLS.query<any>(sql, [portalId, businessId]);
    
    if (!result.success) {
      throw new Error(result.error || 'Database query failed');
    }
    
    const row = result.rows?.[0];
    if (!row) {
      return null;
    }
    
    // Track which lookup path was used for observability
    const usedExplicit = !!row.explicit_businessid;
    const usedFallback = !row.explicit_businessid && !!row.fallback_businessid;
    
    // Log usage for migration tracking
    if (usedFallback) {
      console.warn(`OAuth lookup using fallback for portalId=${portalId}, businessId=${businessId} - consider adding explicit mapping in the future`);
    }
    
    // Return OAuth object matching the expected interface
    return {
      businessid: row.businessid,
      businessId: row.businessid,
      token: row.token,
      apiKey: row.apiKey,
      accessToken: undefined, // Will be populated by token refresh
      tokenvaliduntil: undefined, // Will be populated by token refresh
      _lookupMethod: usedExplicit ? 'explicit' : 'fallback' // For debugging
    };
  }

  /**
   * Get default HubSpot properties (no database access needed)
   */
  getDefaultHubspotProperties(): string[] {
    return [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'company', 'companyid', 'hubspot_owner_id', 'address', 'city', 'state', 'zip', 'deals',
      'associatedcompanyid', 'createdate', 'lastmodifieddate'
    ];
  }
}
