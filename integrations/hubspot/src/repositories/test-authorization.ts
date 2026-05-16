/**
 * Quick test for HubSpot authorization flow
 * Tests the getAuthorization() function with real database data
 */

import { HubSpotRepository } from './hubspot-repository';
import { MySQLService } from '@platform/connectors';
import { ConfigProvider } from '@platform/configuration';
import path from "node:path";
import {fileURLToPath} from "node:url";
import { Client } from '@hubspot/api-client';

async function verifyTestData() {
  console.log('🔍 Verifying test data exists...');
  
  // Verify the data exists in businessCRMAccount
  const verifyResult = await MySQLService.CALLS.query(
    'SELECT * FROM calls.businessCRMAccount WHERE accountid = ? AND businessid = ?',
    ['20564323', 21594]
  );
  
  if (!verifyResult.success || verifyResult.rows.length === 0) {
    throw new Error('Test data not found - please ensure businessCRMAccount has accountid=20564323, businessid=21594');
  }
  
  console.log('✅ Test data verified:', verifyResult.rows[0]);
}

async function testAuthorization() {
  console.log('🧪 Testing HubSpot authorization...');
  
  const hubspotRepo = new HubSpotRepository();
  const portalId = 20564323;
  const businessId = 21594;
  
  try {
    const authResult = await hubspotRepo.getAuthorization(portalId, businessId);
    
    if (authResult.success) {
      console.log('✅ Authorization successful!');
      console.log('📊 OAuth data:', {
        businessId: authResult.data.businessId,
        hasToken: !!authResult.data.token,
        hasApiKey: !!authResult.data.apiKey,
        hasAccessToken: !!authResult.data.accessToken,
        // lookupMethod: authResult.data._lookupMethod
      });
      
      return authResult.data;
    } else {
      console.log('❌ Authorization failed:', authResult.error);
      return null;
    }
  } catch (error) {
    console.error('💥 Authorization test error:', error);
    return null;
  }
}

async function testHubSpotApiCall(oauth: any) {
  console.log('🌐 Testing HubSpot API call...');
  
  if (!oauth.accessToken) {
    console.log('❌ No access token available - skipping API test');
    return false;
  }
  
  try {
    // Create HubSpot client with access token
    const client = new Client({ accessToken: oauth.accessToken });
    
    // Make a simple API call - get contacts (most common and widely scoped)
    console.log('📡 Calling HubSpot API to get contacts...');
    const contactsResponse = await client.crm.contacts.basicApi.getPage(
      5, // limit - just get 5 contacts for testing
      undefined, // after
      ['firstname', 'lastname', 'email', 'phone', 'createdate'] // properties
    );
    
    console.log('✅ HubSpot API call successful!');
    console.log('📊 Contacts data:', {
      totalContacts: contactsResponse.results?.length || 0,
      sampleContacts: contactsResponse.results?.slice(0, 3).map(contact => ({
        id: contact.id,
        firstname: contact.properties?.firstname || 'N/A',
        lastname: contact.properties?.lastname || 'N/A',
        email: contact.properties?.email || 'N/A',
        phone: contact.properties?.phone || 'N/A'
      })) || []
    });
    
    return true;
    
  } catch (error: any) {
    console.error('❌ HubSpot API call failed:', {
      message: error.message,
      status: error.status || 'unknown',
      code: error.code || 'unknown'
    });
    
    // If it's an auth error, the token might be expired
    if (error.status === 401) {
      console.log('💡 This might be an expired token - the refresh logic should handle this');
    }
    
    return false;
  }
}

// No cleanup needed since we're using existing data

async function runTest() {
  console.log('🚀 Starting HubSpot Authorization Test\n');
  
  try {
    // Initialize ConfigProvider
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const configs = await ConfigProvider.initialize({
      configFolder: path.resolve(__dirname, '../../../../config')
    });

    console.log('✅ ConfigProvider initialized\n');
    
    // Verify existing test data
    await verifyTestData();
    console.log('');
    
    // Test authorization
    const oauthData = await testAuthorization();
    console.log('');
    
    // Test actual HubSpot API call if we have OAuth data
    let apiCallSuccess = false;
    if (oauthData) {
      apiCallSuccess = await testHubSpotApiCall(oauthData);
      console.log('');
    }
    
    // Show results
    if (oauthData) {
      console.log('🎉 Authorization test completed successfully!');
      console.log('💡 The getAuthorization() function is working with your database');
      
      if (apiCallSuccess) {
        console.log('🌟 HubSpot API integration is fully working!');
      } else {
        console.log('⚠️ Authorization works, but API call failed (check token validity)');
      }
    } else {
      console.log('❌ Test failed - check the error messages above');
    }
    
  } catch (error) {
    console.error('💥 Test setup error:', error);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest().catch(console.error);
}

export { runTest, verifyTestData, testAuthorization };
