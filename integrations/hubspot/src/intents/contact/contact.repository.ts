/**
 * Contact Data Access Layer - ElasticSearch Repository
 *
 * This is a collection of data access functions for ElasticSearch that handle
 * contact information retrieval and validation for intent processing.
 *
 * DATA SOURCE: ElasticSearch/OpenSearch
 * - Connects to AWS ElasticSearch cluster using OpenSearch client
 * - Queries contact documents by generated contact IDs
 * - Handles ElasticSearch-specific response formats and error conditions
 *
 * ROLE IN INTENT PROCESSING:
 * Contact data from ElasticSearch is essential for intent processing as it provides:
 * - Contact metadata (names, phone numbers, owner information)
 * - Business context (businessId, CRM associations)
 * - Data quality indicators for validation
 *
 * KEY FUNCTIONS:
 * - getContactInfo(): Primary contact lookup by HubSpot contact ID
 * - generateContactId(): Creates consistent contact IDs using SHA256 hashing
 *
 * ID GENERATION STRATEGY:
 * Uses SHA256 hash of "businessId-crmId-externalId" pattern to ensure
 * consistent contact ID generation across different parts of the system.
 *
 * ERROR HANDLING:
 * - Uses Result pattern for consistent error handling
 * - Handles ElasticSearch connection errors, query failures, and missing documents
 * - Provides detailed error context for debugging
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Uses OpenSearchService with built-in retry logic and connection management
 * - Single document lookups by ID for optimal performance
 * - Minimal data transformation to reduce processing overhead
 */
import { logger } from '@platform/core';
import { createHash } from 'crypto';
import { ElasticsearchFacade, OpenSearchService } from '@platform/connectors';
import { ConfigProvider, CONFIG } from '@platform/configuration';
import { Result, Success, Failure, success, failure, createError } from '@platform/core';
import {Intent} from "../../types/intent.types";
import {ContactInfo, ContactInfoWithFound, HubspotUpdateEvent, OpensearchGetResponse} from "../../types/webhook.types";


/**
 * Generate contact ID using SHA256 hash
 *
 * Creates a consistent contact ID by hashing the combination of businessId,
 * crmId, and externalId. This matches the pattern used throughout the system
 * for contact identification.
 *
 * @param businessId - acme business identifier
 * @param crmId - CRM system identifier (16 for HubSpot)
 * @param externalid - External contact ID from CRM system
 * @returns string - SHA256 hash of the combined identifiers
 */
export function generateContactId(
  businessId: number,
  crmId: number,
  externalid: number,
): string {
  const contactString = `${businessId}-${crmId}-${externalid}`;
  return createHash('sha256').update(contactString).digest('hex');
}

/**
 * Retrieve contact information from ElasticSearch
 *
 * Looks up contact data in ElasticSearch using the HubSpot contact ID and business
 * information. Generates a consistent contact ID and queries the ES index for
 * the corresponding contact document.
 *
 * @param intent - Intent configuration containing business ID
 * @param updateEvent - HubSpot update event containing contact ID (objectId)
 * @returns Promise<Result<ContactInfoWithFound>> - Contact data with found flag or error
 */
export async function getContactInfo(
  intent: Intent,
  updateEvent: HubspotUpdateEvent,
): Promise<Result<ContactInfoWithFound>> {
  try {
    // Use the webhook event's portalId as the businessId for contact lookup
    const businessId = intent.businessid;
    const externalid = updateEvent.objectId;
    const crmId = 16; // HubSpot CRM ID

    // Generate contact ID using the same pattern as other parts of the system
    const contactId = generateContactId(businessId, crmId, externalid);

    // Get index name from configuration
    const indexName = ConfigProvider.get(CONFIG.CONTACTS_INDEX, 'contacts2');


    logger.debug( {
      businessId,
      externalid,
      crmId,
      contactId,
      indexName,
      portalId: updateEvent.portalId,
    }, 'Looking up contact in OpenSearch');

    // Query ElasticSearch for the contact using the new Open
    // SearchService
    const result = await ElasticsearchFacade.getContact(businessId, crmId, contactId);


    if (!result.success) {
      const failureResult = result as Failure;
      return failure(createError({
        name: 'ContactLookupError',
        message: `Failed to query OpenSearch for contact: ${failureResult.error.message}`,
        type: 'DATABASE_QUERY_ERROR',
        statusCode: 500,
        cause: failureResult.error,
        context: {
          operation: 'contactLookup',
          data: {
            contactId,
            indexName,
            businessId,
            externalid,
          }
        }
      }));
    }

    // Check if contact was found
    const contactData = result.data as unknown as ContactInfo;
    if (!contactData.found) {
      return failure(createError({
        name: 'ContactNotFoundError',
        message: `Contact not found in OpenSearch`,
        type: 'NOT_FOUND',
        statusCode: 404,
        context: {
          operation: 'contactLookup',
          data: {
            contactId,
            indexName,
            businessId,
            externalid,
          }
        }
      }));
    }



    logger.debug( {
      contactId,
      indexName,
      businessId,
      externalid,
      hasContactData: !!contactData,
    }, 'Successfully retrieved contact from OpenSearch');

    // Return contact info with found flag
    const contactInfo: ContactInfoWithFound = {
      ...contactData,
      found: true,
    };

    return success(contactInfo);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error( {
      error: errorMessage,
      intent: {
        intentFieldName: intent.intentFieldName,
        businessId: intent.businessid,
        intentScoreThreshold: intent.intentScoreThreshold,
      },
      updateEvent: {
        portalId: updateEvent.portalId,
        objectId: updateEvent.objectId,
        propertyName: updateEvent.propertyName,
        propertyValue: updateEvent.propertyValue,
      },
    }, 'Unexpected error in getContactInfo');
    
    return failure(createError({
      name: 'ContactRepositoryError',
      message: `Unexpected error in contact lookup: ${errorMessage}`,
      type: 'INTERNAL_ERROR',
      statusCode: 500,
      cause: error,
    }));
  }
}
