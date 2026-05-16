/**
 * Kitchen-sink test data covering all grouping scenarios
 * Tests: Multiple portals, objects, subscription types, and queue types
 */

import {describe, it, expect, beforeEach} from 'vitest';
import { HubspotWebhookProcessor } from './hubspot.webhook-producer';
import {CONFIG, ConfigProvider} from "@platform/configuration";
import {HubspotUpdateEvent} from "../types";
import path from "path";

const kitchenSinkEvents: HubspotUpdateEvent[] = [
    // Portal 6283166 - Contact 151201308050 - Multiple property changes (INTEGRATION = single queue)
    {
        "eventId": "2112945594",
        "subscriptionId": 1134901,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405321881,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 151201308050,
        "propertyName": "lastname",
        "propertyValue": "McCoy",
        "changeSource": "INTEGRATION",
        // "sourceId": "169804"
    },
    {
        "eventId": "2973247758",
        "subscriptionId": 1134903,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405321881,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 151201308050,
        "propertyName": "phone",
        "propertyValue": "13476971745",
        "changeSource": "INTEGRATION",
        // "sourceId": "169804"
    },
    {
        "eventId": "1088565958",
        "subscriptionId": 1134900,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405321881,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 151201308050,
        "propertyName": "firstname",
        "propertyValue": "DeMauryan",
        "changeSource": "INTEGRATION",
        // "sourceId": "169804"
    },
    
    // Portal 6283166 - Contact 151201308050 - Contact creation (INTEGRATION = single queue)
    {
        "eventId": "1544251844",
        "subscriptionId": 1134898,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405321891,
        "subscriptionType": "contact.creation",
        "attemptNumber": 0,
        "objectId": 151201308050,
        "propertyName": "",
        "propertyValue": "",
        "changeSource": "INTEGRATION"
    },

    // Portal 6283166 - Contact 999888777 - Import changes (IMPORT = import queue)
    {
        "eventId": "3001001001",
        "subscriptionId": 1134901,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405322000,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 999888777,
        "propertyName": "email",
        "propertyValue": "imported@example.com",
        "changeSource": "IMPORT",
        // "sourceId": "bulk-import-123"
    },
    {
        "eventId": "3001001002",
        "subscriptionId": 1134901,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405322001,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 999888777,
        "propertyName": "company",
        "propertyValue": "Imported Corp",
        "changeSource": "IMPORT",
        // "sourceId": "bulk-import-123"
    },

    // Portal 7777777 - Contact 555666777 - Deal changes (different portal)
    {
        "eventId": "4001001001",
        "subscriptionId": 2234901,
        "portalId": 7777777,
        "appId": 223929,
        "occurredAt": 1756405323000,
        "subscriptionType": "deal.propertyChange",
        "attemptNumber": 0,
        "objectId": 555666777,
        "propertyName": "amount",
        "propertyValue": "50000",
        "changeSource": "INTEGRATION",
        // "sourceId": "crm-sync"
    },
    {
        "eventId": "4001001002",
        "subscriptionId": 2234902,
        "portalId": 7777777,
        "appId": 223929,
        "occurredAt": 1756405323001,
        "subscriptionType": "deal.creation",
        "attemptNumber": 0,
        "objectId": 555666777,
        // "changeFlag": "CREATED",
        "changeSource": "INTEGRATION",

    },

    // Portal 7777777 - Contact 555666777 - Contact changes (same objectId, different subscription type)
    {
        "eventId": "4001001003",
        "subscriptionId": 2234903,
        "portalId": 7777777,
        "appId": 223929,
        "occurredAt": 1756405323002,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 555666777,
        "propertyName": "lifecycle_stage",
        "propertyValue": "customer",
        "changeSource": "INTEGRATION",
        // "sourceId": "crm-sync"
    },

    // Portal 6283166 - Contact 888999000 - Mixed queue types (same contact, different changeSources)
    {
        "eventId": "5001001001",
        "subscriptionId": 1134901,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405324000,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 888999000,
        "propertyName": "email",
        "propertyValue": "mixed@example.com",
        "changeSource": "IMPORT",
        // "sourceId": "bulk-import-456"
    },
    {
        "eventId": "5001001002",
        "subscriptionId": 1134901,
        "portalId": 6283166,
        "appId": 223929,
        "occurredAt": 1756405324001,
        "subscriptionType": "contact.propertyChange",
        "attemptNumber": 0,
        "objectId": 888999000,
        "propertyName": "phone",
        "propertyValue": "15551234567",
        "changeSource": "INTEGRATION",
        // "sourceId": "manual-update"
    }
];

process.env.NODE_ENV = 'dev';
process.env.AWS_REGION = 'us-west-2';

describe('HubspotWebhookProcessor - Kitchen Sink Grouping Tests', () => {

    let singleQueue: string;
    let importQueue: string;
    let intentQueue: string;

    beforeEach(async () => {

        // Call the process method directly - perfect for stepping through code
        await ConfigProvider.initialize({
            configFolder: path.resolve(__dirname, '../../../config'),
        })
         singleQueue = ConfigProvider.get(CONFIG.HUBSPOT_WEBHOOK_SINGLE_QUEUE);
         importQueue = ConfigProvider.get(CONFIG.HUBSPOT_WEBHOOK_IMPORT_QUEUE);
         intentQueue = ConfigProvider.get(CONFIG.HUBSPOT_INTENT_QUEUE);


    }, 3000000); // 30 second timeout for AWS calls

    it('should correctly group all webhook scenarios', () => {


        const processor = new HubspotWebhookProcessor();
        const grouped = processor.groupEvents(kitchenSinkEvents);

        // Verify portal-level grouping
        expect(Object.keys(grouped)).toHaveLength(2);
        expect(grouped[6283166]).toBeDefined();
        expect(grouped[7777777]).toBeDefined();

        // Portal 6283166 - Contact 151201308050 - Should have 2 subscription types
        const portal1Contact1 = grouped[6283166][151201308050];
        expect(Object.keys(portal1Contact1)).toHaveLength(2);
        expect(portal1Contact1['contact.propertyChange']).toBeDefined();
        expect(portal1Contact1['contact.creation']).toBeDefined();

        // Should have 3 property changes in single queue (INTEGRATION)
        expect(portal1Contact1['contact.propertyChange'].single).toHaveLength(3);
        expect(portal1Contact1['contact.propertyChange'].import).toHaveLength(0);
        
        // Should have 1 creation event in single queue (INTEGRATION)
        expect(portal1Contact1['contact.creation'].single).toHaveLength(1);
        expect(portal1Contact1['contact.creation'].import).toHaveLength(0);

        // Portal 6283166 - Contact 999888777 - Import events only
        const portal1Contact2 = grouped[6283166][999888777];
        expect(Object.keys(portal1Contact2)).toHaveLength(1);
        expect(portal1Contact2['contact.propertyChange'].import).toHaveLength(2);
        expect(portal1Contact2['contact.propertyChange'].single).toHaveLength(0);

        // Portal 6283166 - Contact 888999000 - Mixed queue types (same subscription type)
        const portal1Contact3 = grouped[6283166][888999000];
        expect(Object.keys(portal1Contact3)).toHaveLength(1);
        expect(portal1Contact3['contact.propertyChange'].import).toHaveLength(1); // IMPORT changeSource
        expect(portal1Contact3['contact.propertyChange'].single).toHaveLength(1); // INTEGRATION changeSource

        // Portal 7777777 - Contact 555666777 - Multiple subscription types
        const portal2Contact1 = grouped[7777777][555666777];
        expect(Object.keys(portal2Contact1)).toHaveLength(3);
        expect(portal2Contact1['deal.propertyChange']).toBeDefined();
        expect(portal2Contact1['deal.creation']).toBeDefined();
        expect(portal2Contact1['contact.propertyChange']).toBeDefined();

        // All events in portal 7777777 should be single queue (INTEGRATION)
        expect(portal2Contact1['deal.propertyChange'].single).toHaveLength(1);
        expect(portal2Contact1['deal.creation'].single).toHaveLength(1);
        expect(portal2Contact1['contact.propertyChange'].single).toHaveLength(1);

        console.log('✅ All grouping scenarios verified successfully');
        console.log('📊 Grouped structure:', JSON.stringify(grouped, null, 2));
    });

    it('should handle edge cases', () => {
        const processor = new HubspotWebhookProcessor();

        // Test empty array
        const emptyGrouped = processor.groupEvents([]);
        expect(Object.keys(emptyGrouped)).toHaveLength(0);

        // Test single event
        const singleEvent = [kitchenSinkEvents[0]];
        const singleGrouped = processor.groupEvents(singleEvent);
        expect(Object.keys(singleGrouped)).toHaveLength(1);
        expect(singleGrouped[6283166][151201308050]['contact.propertyChange'].single).toHaveLength(1);

        console.log('✅ Edge cases handled correctly');
    });
});