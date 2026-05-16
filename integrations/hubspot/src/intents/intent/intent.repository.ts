/**
 * Intent Data Access Layer - MySQL Repository
 *
 * This is a collection of data access functions for MySQL that handle
 * intent record storage, retrieval, and updates for the intent processing system.
 *
 * DATA SOURCE: MySQL Database
 * - Connects to MySQL using acme-common-lib database pool
 * - Executes stored procedures for intent operations
 * - Handles MySQL-specific response formats and error conditions
 *
 * ROLE IN INTENT PROCESSING:
 * MySQL serves as the persistent storage layer for intent processing, storing:
 * - Intent records with AI scores and metadata
 * - Processing status and outcomes
 * - Business intent configurations
 * - Audit trail of intent changes and API calls
 *
 * KEY FUNCTIONS:
 * - intentAddIntents(): Creates new intent records in database
 * - intentUpdateIntents(): Updates intent status after API processing
 * - intentGetBusinessIntents(): Retrieves intent configurations for cache initialization
 * - intentGetIntentByStatus(): Finds existing intents by status (e.g., WAIT records)
 *
 * STORED PROCEDURES:
 * All database operations use stored procedures for:
 * - Consistent business logic enforcement
 * - Performance optimization
 * - Security (SQL injection prevention)
 * - Centralized database logic
 *
 * ERROR HANDLING:
 * - Uses Result pattern for consistent error handling
 * - Handles MySQL connection errors, constraint violations, and query failures
 * - Provides detailed error context for debugging
 * - Includes alerting for critical database failures
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Uses connection pooling via acme-common-lib
 * - Stored procedures for optimized query execution
 * - Minimal data transformation to reduce processing overhead
 * - Proper parameter binding to prevent SQL injection
 */

import { failureFromError, failure, noop, Result, success, fromQueryResult, createError, logger } from '@platform/core';

import { MySQLService } from '@platform/connectors';

import { sendCacheAlert } from '../utils';
import {HubspotUpdateEvent} from "../../types/webhook.types";
import {Intent, IntentRecord, IntentVote, SignalScoreType} from "../../types/intent.types";

/**
 * Add new intent record to database
 *
 * Creates a new intent record in the MySQL database using the intentAddIntent
 * stored procedure. Stores intent metadata, contact information, and AI scores.
 *
 * @param businessId - acme business identifier
 * @param hubspotUpdateEvent - HubSpot webhook event with intent data
 * @param contactSource - Contact information from ElasticSearch
 * @param vote - Intent validation result with score and statistics
 * @returns Promise<Result<IntentRecord>> - Created intent record or error
 * @sideEffects
 *   - Inserts record into MySQL calls.intent_info table
 *   - Generates new intent ID via stored procedure
 *   - Logs database operation attempts and results
 */
export async function intentAddIntents(
  businessId: number,
  hubspotUpdateEvent: HubspotUpdateEvent,
  contactSource: Record<string, unknown>,
  vote: IntentVote,
): Promise<Result<IntentRecord>> {
  try {
    const userid = Number(contactSource?.acmeownerid) || null;
    const externalContactId = Number(contactSource?.externalid) || null;
    const crmId = Number(contactSource?.acmecrmid) || null;

    const params = [
      hubspotUpdateEvent.eventSpanId, // p_globalTraceId
      hubspotUpdateEvent.eventId, // p_globalTraceId

      businessId, // p_businessid
      userid, // p_userid
      externalContactId, // p_externalContactId
      crmId, // p_crmID
      JSON.stringify(hubspotUpdateEvent.parsedValue), // p_intentInfo
      vote.score, // p_signalStatus
      JSON.stringify(vote.stats), // p_signalOutcome
    ];

    // Direct INSERT statement instead of stored procedure
    const insertSql = `
      INSERT INTO calls.intent (
        globalTraceId,
        eventId,
        businessid,
        userid,
        externalContactId,
        crmID,
        intentInfo,
        signalStatus,
        signalOutcome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertResult = await MySQLService.CALLS.query(insertSql, params);
    
    const insertIdResult = fromQueryResult(insertResult, (result) => result.insertId);
    if (!insertIdResult.success) {
      return failure(createError({
        message: 'Failed to get insert ID from database',
        type: 'DatabaseError'
      }));
    }

    const insertId = insertIdResult.data;
    if (!insertId) {
      return failure(createError({
        message: 'No insert ID returned from database',
        type: 'DatabaseError'
      }));
    }

    // Get the inserted record - this matches the stored procedure behavior
    const selectSql = 'SELECT * FROM calls.intent WHERE intentId = ?';
    const selectResult = await MySQLService.CALLS.query<{ success: boolean, rows: IntentRecord[] }>(selectSql, [insertId]);
    
    logger.debug(selectResult.rows, 'intentAddIntent output:');
    
    return fromQueryResult(selectResult, (result) => {
      const insertedRecord = result.rows?.[0] as unknown as IntentRecord;
      if (!insertedRecord) {
        throw new Error('Failed to retrieve inserted record');
      }
      return insertedRecord;
    });
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error(String(error));
    return failureFromError(typedError);
  }
}

export async function getBusinessByAccountId(accountId: string, crmid: number): Promise<Result<number>> {
  try {

    const sql = `
      select
             COALESCE(bca.businessid, bu.businessid) as businessid
      from calls.userCRM uc
               left join calls.businessCRMAccount bca on uc.accountid = bca.accountid  -- Direct lookup first
               left join (
                   select userid, businessId from calls.businessusers where isactive = 1
      ) bu on uc.userid = bu.userid
      where uc.accountid = ?
        and uc.isDeleted = 0
        and uc.crmID = ?
      order by createdate desc
      limit 1;
    `;

    const result = await MySQLService.CALLS.query(sql, [accountId, crmid]);

    return fromQueryResult(result, (queryResult) => {
      const rows = queryResult.rows || [];

      if (!rows || rows.length === 0) {
        const error = sendCacheAlert(
            'No business found for account',
            'get-business-by-account',
            { accountId, crmid, rowCount: rows?.length || 0 },
            new Error('No business found for account'),
        );
        throw error;
      }

      return rows[0].businessid as number;
    });
  } catch (error: unknown) {
    const typedError =
        error instanceof Error ? error : new Error(String(error));
    return failureFromError(typedError);
  }
}



/**
 * Get business intents from database using stored procedure
 *
 * Retrieves all business intent configurations from the database for cache
 * initialization. These configurations determine which HubSpot properties
 * should trigger intent processing.
 *
 * @returns Promise<Result<Intent[]>> - Array of intent configurations or error
 * @sideEffects
 *   - Queries MySQL database via stored procedure
 *   - May send cache alerts on database failures
 *   - Used for cache initialization across Lambda containers
 */
export async function intentGetBusinessIntents(): Promise<Result<Intent[]>> {
  try {
    // Direct SELECT with JOINs instead of stored procedure
    const sql = `
      SELECT DISTINCT
          COALESCE(bca.businessid, bu.businessid) as businessid,
          uc.accountid AS portalId,
          D.intentFieldName,
          D.intentScoreThreshold
      from calls.userCRM uc
               left join calls.businessCRMAccount bca on uc.accountid = bca.accountid
               left join (
          select userid, businessId from calls.businessusers where isactive = 1
      ) bu on uc.userid = bu.userid
               JOIN calls.businessDetails D ON COALESCE(bca.businessid, bu.businessid) = D.businessid
      WHERE uc.crmID = 16
        AND D.intentFieldName IS NOT NULL
        AND COALESCE(bca.businessid, bu.businessid) IS NOT NULL  -- Ensure we found a business
    `;

    const result = await MySQLService.CALLS.query(sql);
    
    return fromQueryResult(result, (queryResult) => {
      const rows = queryResult.rows || [];

      if (!rows || rows.length === 0) {
        const error = sendCacheAlert(
          'No business intents found in MySQL',
          'get-business-intents',
          { rowCount: rows?.length || 0 },
          new Error('No business intents configured'),
        );
        throw error;
      }

      return rows as Intent[];
    });
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error(String(error));
    return failureFromError(typedError);
  }
}

/**
 * Update intent status using stored procedure
 *
 * Updates an existing intent record with processing status and outcome
 * after API calls to the AIO decision engine. Tracks the complete
 * processing lifecycle of each intent.
 *
 * @param intentId
 * @param contactId - Database ID of the intent record to update
 * @param userId - User ID associated with the intent processing
 * @param traceId - Global trace ID for request correlation
 * @param statusCode - Processing status (SENT, FAIL, etc.)
 * @param message - Optional additional context or error details
 * @returns Promise<Result<unknown>> - Update result or error
 * @sideEffects
 *   - Updates MySQL calls.intent_info table
 *   - Records processing outcome and timestamp
 *   - Maintains audit trail of intent processing
 */
export async function intentUpdateIntents(
  intentId: number,
  contactId: number,
  userId: number,
  statusCode: string,
  message?: Record<string, unknown>,
): Promise<Result<unknown>> {
  try {

    // Direct UPDATE statement instead of stored procedure
    const sql = `
      UPDATE calls.intent 
      SET signalStatus = ?,
          userid = ?,
          signalOutcome = ?
      WHERE intentId = ? 
    `;

    const updateParams = [
      statusCode,           // signalStatus
      userId,              // userid  
      JSON.stringify(message || {}), // signalOutcome
      intentId             //  (WHERE clause)
    ];

    const result = await MySQLService.CALLS.query(sql, updateParams);
    
    return fromQueryResult(result, (queryResult) => {
      const affectedRows = queryResult.rows?.[0]?.affectedRows || 0;
      return affectedRows;
    });
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error(String(error));
    return failureFromError(typedError);
  }
}

/**
 * Get intent records by status using stored procedure
 *
 * Retrieves existing intent records filtered by portal ID, contact ID,
 * status, and time range. Used primarily for finding WAIT status intents
 * when processing hubspot_owner_id changes.
 *
 * @param portalId - HubSpot portal (business) identifier
 * @param objectId - HubSpot contact identifier
 * @param status - Intent status to filter by (WAIT, SENT, FAIL, etc.)
 * @param days - Number of days to look back for records
 * @returns Promise<Result<IntentRecord>> - Matching intent record or error
 * @sideEffects
 *   - Queries MySQL database with date range filtering
 *   - Used for finding existing intents to update with new owner info
 *   - Supports hubspot_owner_id change processing workflow
 */
export async function intentGetIntentByStatus(
  portalId: number,
  objectId: number,
  status: SignalScoreType,
  days: number,
): Promise<Result<IntentRecord>> {
  try {
    // Direct SELECT with WHERE clause instead of stored procedure
    const sql = `
      SELECT *
      FROM calls.intent
      WHERE businessid = ?
        AND externalContactId = ?
        AND signalStatus = ?
        AND createDate > NOW() - INTERVAL ? DAY
      ORDER BY createDate DESC 
      LIMIT 1
    `;

    const params = [portalId, objectId, status, days];
    const result = await MySQLService.CALLS.query(sql, params);

    logger.debug(result, 'intentGetIntentByStatus result');
    
    return fromQueryResult(result, (queryResult) => {
      if (!queryResult.rows || queryResult.rows.length === 0) {
        throw new Error('No matching intents found');
      }
      return queryResult.rows[0] as IntentRecord;
    });
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error(String(error));
    return failureFromError(typedError);
  }
}
