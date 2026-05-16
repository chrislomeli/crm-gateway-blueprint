/**
 * AIO Decision Engine API Integration
 *
 * Handles formatting and sending intent data to the AIO (AI Orchestration) decision engine
 * for processing AI-driven intent signals and triggering downstream actions.
 *
 * ROLE IN OVERALL FLOW:
 * This is the final step in the intent processing pipeline where validated intent data
 * is formatted and sent to the external AIO decision engine API. The API response
 * determines whether the intent should trigger further actions or be marked as processed.
 *
 * KEY RESPONSIBILITIES:
 * 1. Format contact and intent data into AIO-compatible request structure
 * 2. Make HTTP requests to AIO decision engine API endpoints
 * 3. Handle API responses and error conditions
 * 4. Transform ElasticSearch contact data to AIO contact format
 * 5. Include intent metadata (scores, thresholds, field names) in requests
 *
 * API INTEGRATION:
 * - Sends POST requests to configurable AIO decision engine URL
 * - Includes authentication and request headers as needed
 * - Handles timeout and retry logic for reliability
 * - Processes both success and error responses from API
 *
 * DATA TRANSFORMATION:
 * - Converts ElasticSearch contact format to AIO contact format
 * - Includes intent score data and thresholds
 * - Adds global trace IDs for request correlation
 * - Formats phone numbers and contact metadata appropriately
 *
 * ERROR HANDLING:
 * - Uses Result pattern for consistent error handling
 * - Logs API request/response details for debugging
 * - Handles network errors, timeouts, and API error responses
 * - Provides detailed error context for troubleshooting
 */

/**
 * Pure business logic functions for AIO (AI Orchestration) request formatting
 *
 * These functions contain no external dependencies and are easy to unit test.
 */

// AIO-14 pass full hubspot payload - Replace @platform/core imports with Lambda-compatible modules
import { v4 as uuidv4 } from 'uuid';
import {
  AppErrorType,
  failure,
  failureFromError,
  Result,
  success,
  logger, getErrorInfo,
} from '@platform/core';
import { createHttpClient } from '@platform/connectors';
import {
  AIOContactInfo,
  AIODecisionRequest,
  Intent,
  IntentPropertyValueSchema,
  IntentRecord,
  SignalScore,
  SignalScoreType
} from "../../types";
import {ContactInfo} from "../../types";


/**
 * Formats an AIO decision request from intent, webhook data, and contact info
 *
 * @param intent The business intent configuration
 * @param webhookParameterValue The parsed webhook parameter value
 * @param contactInfo The contact information from the database
 * @param intentRecord
 * @param fromState
 * @returns Result containing the formatted AIO decision request
 */
export function formatAIODecisionRequest(
  intent: Intent,
  webhookParameterValue: IntentPropertyValueSchema,
  contactInfo: ContactInfo,
  intentRecord: IntentRecord,
  fromState: SignalScoreType = SignalScore.FORWARD,
): Result<AIODecisionRequest> {
  try {
    const esContactData: AIOContactInfo = {
      id: contactInfo._id,
      acmecrmid: String(contactInfo._source?.acmecrmid) || '',
      crmname: contactInfo._source?.crmname || '',
      businessid: intent.businessid.toString(),
      externalid: Number(contactInfo._source?.externalid) || 0,
      ownerid: contactInfo._source?.ownerid || '',
      acmeownerid: String(contactInfo._source?.acmeownerid) || '',
      phone164: contactInfo._source?.phone164 || [],
    };

    const dbData = {
      intentId: intentRecord.intentId,
      intentDate: intentRecord.createDate,
      fromState: intentRecord.signalStatus,
      userResolution: intentRecord.userid
        ? 'user found'
        : 'unresolved - last chance to send',
      intentScoreThreshold: intent.intentScoreThreshold,
      intentFieldName: intent.intentFieldName,
    };

    const response: AIODecisionRequest = {
      globalTraceId: uuidv4(),
      esContactData,
      dbData,
      webhookParameterValue,
    };

    return success(response);
  } catch (error) {
    return failureFromError(error as Error);
  }
}

/**
 * Sends an intent change to the AIO decision engine using httpClient
 *
 * @param decisionApiUrl The full URL to the decision API endpoint
 * @param intent The business intent configuration
 * @param webhookParameterValue The parsed webhook parameter value
 * @param contactInfo The contact information from the database
 * @param intentRecord
 * @param fromState
 * @returns Result containing the HTTP response status and cause information
 */
export async function sendIntentChange(
  decisionApiUrl: string,
  intent: Intent,
  webhookParameterValue: IntentPropertyValueSchema,
  contactInfo: ContactInfo,
  intentRecord: IntentRecord,
  fromState: SignalScoreType = SignalScore.FORWARD,
): Promise<
  Result<{
    statusCode: number;
    cause: Record<string, unknown>;
  }>
> {
  // preconditions
  if (!decisionApiUrl) {
    return failure({
      message: 'decisionApiUrl is required',
      type: AppErrorType.INTERNAL_ERROR,
      statusCode: 555,
    });
  }

  // Start timer for API call
  const startTime = Date.now();

  // Helper function to log timing and return result
  const logTimingAndReturn = <T>(result: Result<T>): Result<T> => {
    const endTime = Date.now();
    const apiCallDuration = endTime - startTime;
    logger.info({
      duration: apiCallDuration,
      intentId: intentRecord.intentId,
      success: result.success,
    }, `Decision engine API call completed in ${apiCallDuration}ms`);
    return result;
  };

  try {
    // Format the Decision engine request
    const formattedResponse = formatAIODecisionRequest(
      intent,
      webhookParameterValue,
      contactInfo,
      intentRecord,
      fromState,
    );
    if (!formattedResponse.success) {
      return logTimingAndReturn(
        failure({
          message: 'could not format response',
          type: AppErrorType.INTERNAL_ERROR,
          statusCode: 555,
          cause: {
            statusCode: 555,
            status: 'formatting_error',
            details: {
              intent,
              webhookParameterValue,
              contactInfo,
            },
          },
        }),
      );
    }

    const body = formattedResponse.data as AIODecisionRequest;

    logger.info(body, '>>>> Sending intent change to decision engine <<<<');

    // Parse URL to extract base URL and path
    const url = new URL(decisionApiUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    const path = url.pathname + url.search;

    // Create httpClient with base URL
    const httpClient = createHttpClient({
      baseUrl,
      timeout: 10000,
      headers: {
        'x-acme-gtid': intentRecord.globalTraceId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'acme-hubspot-webhook-processor/1.0',
      },
      retries: 3,
      circuitBreaker: true
    });

    logger.info({}, `>> POST to ${decisionApiUrl}`);
    logger.debug(body, `>> BODY `);

    // Make the HTTP POST request using httpClient (handles retries, circuit breaker, etc.)
    const result = await httpClient.post(path, body);

    if (result.success) {
      logger.info({ statusCode: result.statusCode }, `<<< RESPONSE`);
      logger.debug(result.data, `<<< RESPONSE`);

      // Return success with status code and cause
      return logTimingAndReturn(
        success({
          statusCode: result.statusCode || 200,
          cause: { status: 'success', httpStatus: result.statusCode },
        }),
      );
    } else {
      // httpClient already handled retries and categorized the error
      logger.error(getErrorInfo(result.error), `<<< FAILED RESPONSE in callDecisionEngine`);
      
      return logTimingAndReturn(
        failure({
          message: result.error.message,
          type: result.error.type || AppErrorType.HTTP_ERROR,
          statusCode: result.error.statusCode || 555,
          cause: {
            statusCode: result.error.statusCode || 555,
            status: result.error.retryable ? 'retry_exhausted' : 'client_error',
            details: {
              errorType: result.error.type,
              message: result.error.message,
              retryable: result.error.retryable
            },
          },
        }),
      );
    }
  } catch (error) {
    return logTimingAndReturn(
      failure({
        message: (error as Error).message || 'Unexpected outer error',
        type: AppErrorType.INTERNAL_ERROR,
        statusCode: 555,
        cause: {
          statusCode: 555,
          status: 'outer_error',
          details: {
            errorName: (error as Error).name,
            errorMessage: (error as Error).message,
          },
        },
      }),
    );
  }
}
