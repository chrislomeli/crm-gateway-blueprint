/**
 * HubSpot Intent Processing Service
 *
 * Processes HubSpot webhook events to extract AI-driven intent signals
 * from contact property changes and routes them to the decision engine.
 */

import { validateContactRequiredFields, getContactInfo } from '../contact';
import {
  AppErrorType,
  failure,
  failureFromError,
  isNoop,
  noop,
  Result,
  success,
  logger, getErrorInfo,
} from '@platform/core';
import { sendIntentChange } from './aio-formatter';
import { isValidIntentTrigger } from './event-filters';
import {CONFIG, ConfigProvider} from '@platform/configuration';
import { parseIntentPropertyValue } from './intent.property-parser';
import {
  intentAddIntents,
  intentGetIntentByStatus,
  intentUpdateIntents,
} from './intent.repository';


import {
  ContactInfo,
  HubspotUpdateEvent,
} from '../../types/webhook.types';

import {
  Intent,
  IntentPropertyValueSchema,
  IntentRecord,
  SignalScore,
  SignalScoreType,
} from '../../types/intent.types';


import { IntentsCache } from '../cache';

export class IntentService {
  private cache: IntentsCache;
  private decisionApiUrl: string;

  constructor(cache?: IntentsCache) {
    this.cache = cache || new IntentsCache();

    // Validate configuration on construction
    const url = ConfigProvider.get(CONFIG.HUBSPOT_DECISION_API);
    if (!url) {
      throw new Error('Decision API URL is not configured');
    }
    this.decisionApiUrl = String(url);
  }

  /**
   * Main entry point for processing HubSpot webhook events
   */
  async dispatchAIOEvent(updateEvent: HubspotUpdateEvent): Promise<Result<unknown>> {
    try {
      this.logEvent('Processing HubSpot AIO event', updateEvent);

      // Step 1: Check cache for matching intent configuration
      const cacheResult = await this.cache.cacheHit(updateEvent);

      if (!cacheResult.success) {
        const errorInfo = getErrorInfo(cacheResult);
        logger.error({
          error: errorInfo,
          propertyName: updateEvent.propertyName
        }, 'Cache error');
        return cacheResult;
      }

      if (isNoop(cacheResult)) {
        logger.info({
          propertyName: updateEvent.propertyName,
          portalId: updateEvent.portalId
        }, 'Cache miss - not a target intent');
        return noop('Not a target intent');
      }

      const businessIntent = cacheResult.data.intent;

      // Step 2: Determine processing scenario
      const scenario = await this.determineScenario(updateEvent, businessIntent);
      if (!scenario.success ) {
        const errorInfo = getErrorInfo(scenario);
        logger.error({
          error: errorInfo,
          propertyName: updateEvent.propertyName
        }, 'Scenario error');
        return scenario;
      }
      if (isNoop(scenario)) {
        logger.info({
          propertyName: updateEvent.propertyName,
          portalId: updateEvent.portalId
        }, 'Noop scenario');
        return scenario;
      }

      // Step 3: Process based on scenario
      if (scenario.data.isOwnerChange) {
        return await this.processOwnerChange(
            businessIntent,
            scenario.data.existingIntent!,
            scenario.data.updateEvent
        );
      } else {
        return await this.processIntentChange(
            businessIntent,
            scenario.data.updateEvent
        );
      }

    } catch (error) {
      return this.handleError(error, 'dispatchAIOEvent', updateEvent);
    }
  }

  /**
   * Process new intent changes from HubSpot
   */
  private async processIntentChange(
      businessIntent: Intent,
      updateEvent: HubspotUpdateEvent
  ): Promise<Result<unknown>> {
    try {
      // Get and validate contact
      const contactResult = await getContactInfo(businessIntent, updateEvent);
      if (!contactResult.success) {
        logger.error({
          error: getErrorInfo(contactResult),
          updateEvent
        }, 'Contact lookup failed');
        return failure({
          message: 'Contact lookup failed',
          type: AppErrorType.INTERNAL_ERROR
        });
      }

      const contactInfo = contactResult.data;
      const validation = validateContactRequiredFields(contactInfo);

      if (validation.score === SignalScore.FAIL) {
        return failure({
          message: 'Contact validation failed',
          type: AppErrorType.VALIDATION_ERROR
        });
      }

      if (validation.score === SignalScore.NOOP) {
        logger.info({}, 'Contact validation resulted in NOOP');
        return noop('Contact validation NOOP');
      }

      // Store intent in database
      const storeResult = await intentAddIntents(
          businessIntent.businessid,
          updateEvent,
          contactInfo._source || {},
          validation
      ) as unknown as Result<IntentRecord>;

      if (!storeResult.success) {
        return storeResult;
      }

      const intentRecord = storeResult.data;

      // Send to decision engine if score is FORWARD
      if (validation.score === SignalScore.FORWARD) {
        return await this.sendToDecisionEngine(
            businessIntent,
            updateEvent,
            contactInfo,
            intentRecord,
            Number(contactInfo._source?.acmeownerid) || 0,
            SignalScore.FORWARD
        );
      }

      logger.info({}, `Intent stored with score ${validation.score} - not sending to decision engine`);
      return success({ score: validation.score });

    } catch (error) {
      return this.handleError(error, 'processIntentChange', updateEvent);
    }
  }

  /**
   * Process owner changes for existing intents
   */
  private async processOwnerChange(
      businessIntent: Intent,
      existingIntent: IntentRecord,
      updateEvent: HubspotUpdateEvent
  ): Promise<Result<unknown>> {
    try {
      // Get and validate contact
      const contactResult = await getContactInfo(businessIntent, updateEvent);
      if (!contactResult.success) {
        logger.error({
          error: getErrorInfo(contactResult),
          updateEvent
        }, 'Contact lookup failed');
        return failure({
          message: 'Contact lookup failed',
          type: AppErrorType.INTERNAL_ERROR
        });
      }

      const contactInfo = contactResult.data;
      const validation = validateContactRequiredFields(contactInfo);

      if (validation.score === SignalScore.FAIL) {
        return failure({
          message: 'Contact validation failed',
          type: AppErrorType.VALIDATION_ERROR
        });
      }

      if (validation.score === SignalScore.NOOP) {
        logger.info({}, 'Contact validation resulted in NOOP');
        return noop('Contact validation NOOP');
      }

      // Always send owner changes to decision engine
      return await this.sendToDecisionEngine(
          businessIntent,
          updateEvent,
          contactInfo,
          existingIntent,
          Number(contactInfo._source?.acmeownerid) || 0,
          SignalScore.WAIT
      );

    } catch (error) {
      return this.handleError(error, 'processOwnerChange', updateEvent);
    }
  }

  /**
   * Determine if this is an owner change or intent field change
   */
  private async determineScenario(
      updateEvent: HubspotUpdateEvent,
      businessIntent: Intent
  ): Promise<Result<{
    isOwnerChange: boolean;
    existingIntent: IntentRecord | null;
    updateEvent: HubspotUpdateEvent;
  }>> {

    logger.info({updateEvent}, '++ ENTER DETERMINE SCENARIO: updateEvent ++');
    logger.info({businessIntent}, '++ ENTER DETERMINE SCENARIO: businessIntent ++');

    const propertyName = updateEvent.propertyName?.trim().toLowerCase() || '';

    // Check for owner change
    if (updateEvent.subscriptionType === 'contact.propertyChange' &&
        propertyName === 'hubspot_owner_id') {

      logger.info({}, 'Handling hubspot_owner_id change');

      // Look for existing WAIT intents
      const daysToWait = Number(ConfigProvider.get(CONFIG.HUBSPOT_INTENT_TTL_DAYS, 2));
      const existingResult = await intentGetIntentByStatus(
          businessIntent.businessid,
          updateEvent.objectId,
          SignalScore.WAIT,
          daysToWait
      );

      if (!existingResult.success || isNoop(existingResult)) {
        return noop('No existing WAIT intent found for owner change');
      }

      // Parse the existing intent data
      const updatedEvent = {
        ...updateEvent,
        parsedValue: JSON.parse(existingResult.data.intentInfo)
      };

      return success({
        isOwnerChange: true,
        existingIntent: existingResult.data,
        updateEvent: updatedEvent
      });
    }

    // Check for intent field change
    if (businessIntent.intentFieldName.trim().toLowerCase() === propertyName) {
      logger.info({}, `Handling intent field change: ${propertyName}`);

      // Parse intent data from property value
      const parsed = parseIntentPropertyValue(updateEvent.propertyValue || '');

      if (!parsed.success) {
        logger.error({
          error: getErrorInfo(parsed),
          propertyValue: updateEvent.propertyValue
        }, 'Failed to parse intent property value');
        return failure({
          message: 'Failed to parse intent property value',
          type: AppErrorType.VALIDATION_ERROR
        });
      }

      const intentData = parsed.data as IntentPropertyValueSchema;

      // Validate trigger
      if (!isValidIntentTrigger(intentData.intent_trigger)) {
        return failure({
          message: 'Invalid or missing intent_trigger',
          type: AppErrorType.VALIDATION_ERROR
        });
      }

      const updatedEvent = {
        ...updateEvent,
        parsedValue: intentData
      };

      return success({
        isOwnerChange: false,
        existingIntent: null,
        updateEvent: updatedEvent
      });
    }

    // Not a relevant property change
    logger.info({
      propertyName,
      intentFieldName: businessIntent.intentFieldName
    }, 'Property change not relevant for intent processing');

    return noop('Not a target property');
  }

  /**
   * Send intent to decision engine and update database
   */
  private async sendToDecisionEngine(
      businessIntent: Intent,
      updateEvent: HubspotUpdateEvent,
      contactInfo: ContactInfo,
      intentRecord: IntentRecord,
      userId: number,
      fromState: SignalScoreType
  ): Promise<Result<unknown>> {
    try {
      if (!updateEvent.parsedValue) {
        return failure({
          message: 'Missing parsed intent data',
          type: AppErrorType.VALIDATION_ERROR
        });
      }

      logger.info({
        intentId: intentRecord.intentId,
        portalId: updateEvent.portalId,
        fromState
      }, 'Calling decision engine API');

      // Call decision engine
      const apiResult = await sendIntentChange(
          this.decisionApiUrl,
          businessIntent,
          updateEvent.parsedValue,
          contactInfo,
          intentRecord,
          fromState
      );

      if (!apiResult.success) {
        logger.error({ error: getErrorInfo(apiResult) }, 'Decision engine API failed');
        return apiResult;
      }

      logger.info({ data: apiResult.data }, 'Decision engine API successful');

      // Update database with result
      if (intentRecord.intentId && intentRecord.intentId > 0) {
        const updateResult = await intentUpdateIntents(
            intentRecord.intentId,
            updateEvent.objectId,
            userId,
            'SENT',
            apiResult.data?.cause || { status: 'success' }
        );

        if (!updateResult.success) {
          logger.error({ error: getErrorInfo(updateResult) }, 'Failed to update intent status');
          // Don't fail the whole operation if just the status update failed
        }
      }

      return apiResult;

    } catch (error) {
      return this.handleError(error, 'sendToDecisionEngine', updateEvent);
    }
  }

  /**
   * Centralized error handling
   */
  private handleError(
      error: unknown,
      context: string,
      updateEvent: HubspotUpdateEvent
  ): Result<unknown> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error({
      error: errorMessage,
      stack,
      context: {
        portalId: updateEvent.portalId,
        objectId: updateEvent.objectId,
        propertyName: updateEvent.propertyName,
        eventId: updateEvent.eventId
      }
    }, `Error in ${context}`);

    return failure({
      message: `Error in ${context}: ${errorMessage}`,
      type: AppErrorType.INTERNAL_ERROR,
      cause: error
    });
  }

  /**
   * Simplified event logging
   */
  private logEvent(message: string, updateEvent: HubspotUpdateEvent): void {
    logger.info({
      portalId: updateEvent.portalId,
      objectId: updateEvent.objectId,
      propertyName: updateEvent.propertyName,
      eventId: updateEvent.eventId,
      subscriptionType: updateEvent.subscriptionType,
      changeSource: updateEvent.changeSource
    }, message);
  }
}