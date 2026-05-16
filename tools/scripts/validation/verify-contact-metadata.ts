#!/usr/bin/env tsx

/**
 * Contact Metadata Verification Script
 * 
 * Verifies that our processingMetadata stamping implementation is working correctly
 * by looking up a recently processed contact and checking for the metadata fields.
 */

import { ElasticsearchFacade } from '@platform/connectors';
import { ConfigProvider } from '@platform/configuration';
import {getErrorInfo, logger} from '@platform/core';

const CRMID = 16;  // HubSpot CRM ID - extend this later to support other CRM IDs

async function verifyContactMetadata() {
    try {
        logger.info('🔍 Starting contact metadata verification...');
        
        // Initialize configuration
        await ConfigProvider.initialize();
        logger.info('✅ Configuration initialized');
        
        // We need to search for the most recently updated contact
        // Since we don't know the exact contact ID, let's search for contacts with processingMetadata
        const businessId = '123'; // This should match the businessId from our test
        
        const searchQuery = {
            query: {
                exists: {
                    field: 'processingMetadata'
                }
            },
            sort: [
                {
                    'processingMetadata.lastUpdated': {
                        order: 'desc'
                    }
                }
            ],
            size: 1
        };
        
        logger.info({ businessId, query: searchQuery }, '🔍 Searching for contacts with processingMetadata...');

        const crmId = 16;
        const searchResult = await ElasticsearchFacade.searchContacts(businessId, CRMID, searchQuery);
        
        if (!searchResult.success) {
            logger.error( { error: searchResult.error }, '❌ Failed to search contacts');
            return;
        }
        
        const hits = searchResult.data?.hits?.hits || [];
        
        if (hits.length === 0) {
            logger.warn('⚠️ No contacts found with processingMetadata');
            logger.info('💡 This might mean:');
            logger.info('   - The contact indexing is still in progress');
            logger.info('   - The metadata stamping is not working');
            logger.info('   - The businessId doesn\'t match');
            return;
        }
        
        const contact = hits[0]._source;
        const contactId = hits[0]._id;
        
        logger.info({
            contactId,
            externalId: contact.externalid,
            businessId: contact.businessid
        }, '✅ Found contact with metadata!');
        
        // Verify the processingMetadata structure
        if (contact.processingMetadata) {
            logger.info( {
                lastUpdated: contact.processingMetadata.lastUpdated,
                source: contact.processingMetadata.source,
                traceId: contact.processingMetadata.traceId,
                spanId: contact.processingMetadata.spanId
            }, '🎉 processingMetadata found!');
            
            // Validate expected fields
            const expectedFields = ['lastUpdated', 'source', 'traceId', 'spanId'];
            const missingFields = expectedFields.filter(field => !(field in contact.processingMetadata));
            
            if (missingFields.length === 0) {
                logger.info('✅ All expected metadata fields are present!');
                
                // Validate field values
                if (contact.processingMetadata.source === 'webhook') {
                    logger.info('✅ Source correctly set to "webhook"');
                } else {
                    logger.warn('⚠️ Source is not "webhook":', contact.processingMetadata.source);
                }
                
                if (contact.processingMetadata.traceId) {
                    logger.info('✅ TraceId is present:', contact.processingMetadata.traceId);
                } else {
                    logger.warn('⚠️ TraceId is missing or empty');
                }
                
                if (contact.processingMetadata.spanId) {
                    logger.info('✅ SpanId is present:', contact.processingMetadata.spanId);
                } else {
                    logger.warn('⚠️ SpanId is missing or empty');
                }
                
                logger.info('🎯 METADATA STAMPING VERIFICATION: SUCCESS!');
                
            } else {
                logger.error(missingFields, '❌ Missing expected metadata fields:');
            }
        } else {
            logger.error('❌ processingMetadata not found in contact');
        }
        
        // Also show the full contact structure for debugging
        logger.info({
            ...Object.fromEntries(Object.entries(contact).slice(0, 10))
        }, '📋 Full contact structure (first 10 fields):');
        
    } catch (error) {
        logger.error(getErrorInfo(error),'💥 Error during metadata verification:');
    }
}

// Run the verification
verifyContactMetadata()
    .then(() => {
        logger.info('🏁 Contact metadata verification complete');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('💥 Fatal error:', error);
        process.exit(1);
    });
