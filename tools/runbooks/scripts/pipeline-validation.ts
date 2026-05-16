#!/usr/bin/env tsx
/**
 * Pipeline Validation Tool
 * 
 * Provides both row count monitoring and trace ID-based validation for the HubSpot pipeline.
 * Uses @platform/connectors for consistent database and Elasticsearch access.
 * 
 * Usage:
 *   # Row count monitoring (fast, good for volume testing)
 *   tsx tools/runbooks/scripts/pipeline-validation.ts counts
 * 
 *   # Trace ID validation (precise, good for single event validation)
 *   tsx tools/runbooks/scripts/pipeline-validation.ts trace <traceId>
 * 
 *   # Contact lookup by HubSpot ID
 *   tsx tools/runbooks/scripts/pipeline-validation.ts contact <hubspotContactId>
 */

import { MySQLService } from '@platform/connectors';
import { ElasticsearchFacade } from '@platform/connectors';
import { ConfigProvider } from '@platform/configuration';
import { logger } from '@platform/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ValidationCounts {
    opensearchContacts: number;
    callsIntentRows: number;
    timestamp: string;
}

interface TraceValidationResult {
    traceId: string;
    foundInOpensearch: boolean;
    foundInCallsIntent: boolean;
    contactData?: any;
    intentData?: any;
    errors: string[];
}

class PipelineValidator {
    private mysqlService: MySQLService | null = null;
    private businessId: string;
    private crmId: number;

    constructor(businessId: string = '21594', crmId: number = 16) {
        this.businessId = businessId; // Business ID should match the actual event data from publisher
        this.crmId = crmId; // CRM ID is standardized to 16
    }

    async initialize(): Promise<void> {
        try {
            // Find project root for config using the same pattern as test-webhook-handler.ts
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            
            // Search for the main project root (the one with pnpm-workspace.yaml and config folder)
            let searchDir = __dirname;
            let projectRoot = null;
            
            while (searchDir !== path.dirname(searchDir)) { // Stop at filesystem root
                const packageJsonPath = path.join(searchDir, 'package.json');
                const workspaceYamlPath = path.join(searchDir, 'pnpm-workspace.yaml');
                const configPath = path.join(searchDir, 'config');
                
                const fs = await import('node:fs');
                if (fs.existsSync(packageJsonPath) && fs.existsSync(workspaceYamlPath) && fs.existsSync(configPath)) {
                    projectRoot = searchDir;
                    break;
                }
                searchDir = path.dirname(searchDir);
            }
            
            if (!projectRoot) {
                throw new Error('Could not find main project root (with pnpm-workspace.yaml and config folder)');
            }

            const configOptions = {
                configFolder: path.join(projectRoot, 'config')
            };

            console.log('📁 Project root:', projectRoot);
            console.log('⚙️ Config folder:', configOptions.configFolder);

            // Initialize configuration with the same pattern as working script
            await ConfigProvider.initialize(configOptions);

            // Initialize services using static getter (same pattern as webhook-subscriber)
            this.mysqlService = MySQLService.CALLS;

            // ElasticsearchFacade is static - no initialization needed
            console.log('✅ Pipeline validator initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize pipeline validator:', error);
            throw error;
        }
    }

    /**
     * Get current row counts for monitoring
     */
    async getValidationCounts(): Promise<ValidationCounts> {
        if (!this.mysqlService) {
            throw new Error('Services not initialized');
        }

        console.log(`📊 Gathering validation counts for businessId: ${this.businessId}...`);

        // Get OpenSearch contact count for this specific tenant using static method
        const contactCountResult = await ElasticsearchFacade.searchContacts(this.businessId, this.crmId, 
            { match_all: {} }, // Direct query content
            { size: 0 } // Options object
        );

        // Get calls.intent table row count
        const intentCountResult = await this.mysqlService.query(
            'SELECT COUNT(*) as count FROM calls.intent'
        );

        const counts: ValidationCounts = {
            opensearchContacts: contactCountResult.success ? (contactCountResult.data?.hits?.total?.value || 0) : 0,
            callsIntentRows: intentCountResult.success ? (intentCountResult.rows[0]?.count || 0) : 0,
            timestamp: new Date().toISOString()
        };

        return counts;
    }

    /**
     * Validate a specific trace ID across all systems
     */
    async validateByTraceId(traceId: string): Promise<TraceValidationResult> {
        if (!this.mysqlService) {
            throw new Error('Services not initialized');
        }

        console.log(`🔍 Validating trace ID: ${traceId}`);

        const result: TraceValidationResult = {
            traceId,
            foundInOpensearch: false,
            foundInCallsIntent: false,
            errors: []
        };

        try {
            // Search OpenSearch for contact with this trace ID using static method
            const contactSearchResult = await ElasticsearchFacade.searchContacts(this.businessId, this.crmId, {
                term: { "processingMetadata.traceId": traceId }
            });

            if (contactSearchResult.success && contactSearchResult.data?.hits?.hits?.length > 0) {
                result.foundInOpensearch = true;
                result.contactData = contactSearchResult.data.hits.hits[0]._source;
                console.log('✅ Found contact in OpenSearch');
            } else {
                console.log('⚠️  Contact not found in OpenSearch');
            }

            // Search calls.intent table for this trace ID
            const intentSearchResult = await this.mysqlService.query(
                'SELECT * FROM calls.intent WHERE globalTraceId = ? LIMIT 1',
                [traceId]
            );

            if (intentSearchResult.success && intentSearchResult.rows.length > 0) {
                result.foundInCallsIntent = true;
                result.intentData = intentSearchResult.rows[0];
                console.log('✅ Found intent record in calls.intent');
            } else {
                console.log('⚠️  Intent record not found in calls.intent');
            }

        } catch (error) {
            result.errors.push(`Validation error: ${error}`);
            console.error('❌ Error during trace validation:', error);
        }

        return result;
    }

    /**
     * Validate a specific contact by HubSpot ID using direct ID lookup
     */
    async validateByContactId(hubspotContactId: string): Promise<any> {
        if (!this.mysqlService) {
            throw new Error('Services not initialized');
        }

        console.log(`🔍 Validating HubSpot contact ID: ${hubspotContactId}`);

        try {
            // Generate the deterministic contact ID using businessId, crmId, and hubspotContactId
            const contactId = ElasticsearchFacade.generateContactId(
                parseInt(this.businessId), 
                this.crmId, 
                parseInt(hubspotContactId)
            );

            if (!contactId) {
                console.log('❌ Failed to generate contact ID');
                return null;
            }

            console.log(`🔑 Generated contact ID: ${contactId}`);

            // Direct lookup by ID (much faster than query)
            const contactResult = await ElasticsearchFacade.getContact(this.businessId, this.crmId, contactId);

            if (contactResult.success && contactResult.data?._source) {
                const contactData = contactResult.data._source;
                
                // Show key contact info
                console.log('✅ Found contact in OpenSearch:');
                console.log(`   📧 Email: ${contactData.email || 'N/A'}`);
                console.log(`   👤 Name: ${contactData.firstName || 'N/A'} ${contactData.lastName || 'N/A'}`);
                console.log(`   🆔 HubSpot ID: ${contactData.hubspotId || contactData.externalId || 'N/A'}`);
                
                // Show processing metadata with trace ID validation
                if (contactData.processingMetadata) {
                    console.log('📋 Processing Metadata:');
                    console.log(`   🔍 Trace ID: ${contactData.processingMetadata.traceId || 'N/A'}`);
                    console.log(`   📅 Last Updated: ${contactData.processingMetadata.lastUpdated || 'N/A'}`);
                    console.log(`   📦 Source: ${contactData.processingMetadata.source || 'N/A'}`);
                } else {
                    console.log('⚠️  No processingMetadata found in contact');
                    // Show the full structure to debug
                    console.log('🔍 Full contact structure keys:', Object.keys(contactData));
                }
                
                return contactData;
            } else {
                console.log('⚠️  Contact not found in OpenSearch');
                console.log(`🔍 Searched for contact ID: ${contactId}`);
                return null;
            }

        } catch (error) {
            console.error('❌ Error during contact validation:', error);
            throw error;
        }
    }

    /**
     * Display validation counts in a nice format
     */
    displayCounts(counts: ValidationCounts): void {
        console.log('\n📊 Pipeline Validation Counts');
        console.log('================================');
        console.log(`🕐 Timestamp: ${counts.timestamp}`);
        console.log(`🏢 Business ID: ${this.businessId}`);
        console.log(`👥 OpenSearch Contacts: ${counts.opensearchContacts.toLocaleString()}`);
        console.log(`📞 calls.intent Rows: ${counts.callsIntentRows.toLocaleString()}`);
        console.log('================================\n');
    }

    /**
     * Display trace validation results
     */
    displayTraceValidation(result: TraceValidationResult): void {
        console.log('\n🔍 Trace ID Validation Results');
        console.log('===============================');
        console.log(`🆔 Trace ID: ${result.traceId}`);
        console.log(`📊 OpenSearch: ${result.foundInOpensearch ? '✅ Found' : '❌ Not Found'}`);
        console.log(`📞 calls.intent: ${result.foundInCallsIntent ? '✅ Found' : '❌ Not Found'}`);
        
        if (result.contactData) {
            console.log('\n👤 Contact Data:');
            console.log(`   Email: ${result.contactData.email || 'N/A'}`);
            console.log(`   Name: ${result.contactData.firstName || ''} ${result.contactData.lastName || ''}`.trim() || 'N/A');
            console.log(`   HubSpot ID: ${result.contactData.hubspotId || 'N/A'}`);
        }

        if (result.intentData) {
            console.log('\n📞 Intent Data:');
            console.log(`   Intent ID: ${result.intentData.id || 'N/A'}`);
            console.log(`   Created: ${result.intentData.createdAt || 'N/A'}`);
            console.log(`   Business ID: ${result.intentData.businessId || 'N/A'}`);
        }

        if (result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach(error => console.log(`   ${error}`));
        }
        console.log('===============================\n');
    }

    async cleanup(): Promise<void> {
        try {
            if (this.mysqlService) {
                await this.mysqlService.close();
            }
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('⚠️  Error during cleanup:', error);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || !['counts', 'trace', 'contact'].includes(command)) {
        console.log('Usage:');
        console.log('  tsx tools/runbooks/scripts/pipeline-validation.ts counts [businessId]');
        console.log('  tsx tools/runbooks/scripts/pipeline-validation.ts trace <traceId> [businessId]');
        console.log('  tsx tools/runbooks/scripts/pipeline-validation.ts contact <hubspotContactId> [businessId]');
        console.log('');
        console.log('Default businessId is "21594" (should match actual event data from publisher)');
        process.exit(1);
    }

    // Extract businessId from args (different position depending on command)
    let businessId = '21594'; // Default - should match actual event data from publisher
    if (command === 'counts' && args[1]) {
        businessId = args[1];
    } else if ((command === 'trace' || command === 'contact') && args[2]) {
        businessId = args[2];
    }

    const validator = new PipelineValidator(businessId);
    
    try {
        await validator.initialize();

        switch (command) {
            case 'counts':
                const counts = await validator.getValidationCounts();
                validator.displayCounts(counts);
                break;

            case 'trace':
                const traceId = args[1];
                if (!traceId) {
                    console.error('❌ Trace ID required');
                    process.exit(1);
                }
                const traceResult = await validator.validateByTraceId(traceId);
                validator.displayTraceValidation(traceResult);
                break;

            case 'contact':
                const contactId = args[1];
                if (!contactId) {
                    console.error('❌ HubSpot contact ID required');
                    process.exit(1);
                }
                await validator.validateByContactId(contactId);
                break;
        }

    } catch (error) {
        console.error('💥 Validation failed:', error);
        process.exit(1);
    } finally {
        await validator.cleanup();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { PipelineValidator };
