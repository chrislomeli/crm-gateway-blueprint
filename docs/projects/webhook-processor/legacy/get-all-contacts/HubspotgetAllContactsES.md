
```typescript
import { crmLogger } from 'acme-common-lib-v3/acme-crm-error-logger/crmLogger';
import {
  ICRMLoggerProps,
  RequestType,
} from 'acme-common-lib-v3/acme-crm-error-logger/interfaces/ICRMLoggerProps';
/**
 * Created by ksharpie on 8/29/2016.
 */

/*
 * Process:
 *   receive
 *     portalid
 *     page
 *     oauth data
 *     business
 *     user
 *   Get next page (or first)
 *   Transform data
 *   Insert to ES
 *   Get more if necessary
 *
 *
 * */
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import assert from 'assert';
import hash from 'hash.js';
import { getElasticSearchClient } from 'acme-common-lib-v3/acme-es-processes/es-utilities';
import { getConstant } from 'acme-common-lib-v3/acme-util/constants';
import { hubspotGetAllContactsFunctionName } from 'acme-common-lib-v3/acme-util/constants-util';
import _ from 'lodash';
import { DateTime } from 'luxon';
//const hubspot = require('@hubspot/api-client');
import { Client } from '@hubspot/api-client';
import Axios, { AxiosResponse } from 'axios';
import * as dbPool from 'acme-common-lib-v3/acme-db-pool';
import {
  castError,
  convertToe164,
  CreateResponse,
} from 'acme-common-lib-v3/acme-util';

import { AssociatedId } from '@hubspot/api-client/lib/codegen/crm/associations';
import { CollectionResponseSimplePublicObjectWithAssociationsForwardPaging } from '@hubspot/api-client/lib/codegen/crm/contacts';
import { SimplePublicObject } from '@hubspot/api-client/lib/codegen/crm/deals';
import { Context } from 'aws-lambda';
import { transformObjForDocAndUpsert } from 'acme-common-lib-v3/acme-es-processes';
import { Logger } from 'acme-common-lib-v3/acme-logger';
import { getCRMPropertiesByBusiness } from '../../../../../../../crm-135/acme-cdk-develop/src/lambdas/crms/crmProps/businessCRMProperties/getCRMPropertiesByBusiness';
import {
  deleteESDDBCRMContacts,
  getContactSyncStatus2,
} from '../../../../../../../crm-135/acme-cdk-develop/src/lambdas/crms/crmProps/refreshContactCRM/contactSync.service';
import { initiateCRMContactSync } from '../../../../../../../crm-135/acme-cdk-develop/src/lambdas/crms/hubspot/hubspot-crm-props-sync/utils';
import {
  getHubspotDealsInBulk,
  getHubspotProperties,
  sendToHubspotCRMProperties,
} from '../../../../../../../crm-135/acme-cdk-develop/src/lambdas/crms/hubspot/lib/hubspot-lib';
import {
  IContactDealAssociation,
  IHubspotContactDataTransformed,
  IHubspotDealData,
  IHubspotSyncEventTransformed,
} from '../../../../../../../crm-135/acme-cdk-develop/src/lambdas/crms/hubspot/lib/interfaces';

// Stop if less than 30 seconds is left before the lambda execution times out
const SAFE_EXECUTION_MILLIS_THRESHOLD = 10000; // 10 Seconds before the lambda ends because some calls take more than 4 seconds to run
const SAFE_EXECUTION_MILLIS_THRESHOLD_2 = 60000;
// const s3Credentials = new AWS.Credentials(
//   getConstant('AWS_S3_ACCESS_KEY_ID')!,
//   getConstant('AWS_S3_ACCESS_KEY_SECRET')!,
// );

const HUBSPOT_CRM_ID = '16';
const ACCESS_TOKEN_TTL_SECONDS = 1770;

export interface THubspotWebhookRequest2 {
  test: any;
  userId?: any;
  crmID?: string;
  hubspot?: { results: any[] };
  hasMore?: boolean;
  externalOwnersToacmeUsersMap?: any;
  portalid?: any;
  contactSyncId?: any;
  processedCounter: number;
  contactCounter: number;
  phoneValidationErrors: number;
  hubspotApiErrors: number;
  delete?: boolean;
  oauth: {
    businessId?: string;
    accessToken?: string | undefined;
    token: string;
    businessid: number;
    apiKey?: string;
    tokenvaliduntil?: any;
  };
  offset: string;
  transformed: object[];
  converted: object[];
  es?: object[];
  ids?: string[];
  recursionCounter: number;
}

export async function handler(
  event: THubspotWebhookRequest2,
  context: Context,
) {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log('IN ', process.env.ENV_NAME);

  // // Set the S3 credentials, region
  // AWS.config.update({
  //   credentials: s3Credentials,
  //   region: process.env.S3_REGION,
  // });

  CreateResponse(undefined);
  const logger = new Logger({
    event,
    context,
    transactionId: context.awsRequestId,
  });

  if (event.ids && event.ids.length > 0) {
    // logger.info('Single Contact Sync');
  } else {
    logger.info(
      'FULL Contact Sync AFTER',
      'BID',
      event?.oauth?.businessid,
      'event',
      event,
    );
  }

  logger.info(
    'HubspotgetAllContactsES - BID',
    event?.oauth?.businessid,
    'portalid',
    event?.portalid,
    'Lambda Reinvocation',
    event?.processedCounter > 0,
    'processedCounter',
    event?.processedCounter,
    'recursionCounter',
    event?.recursionCounter ? event.recursionCounter : 0,
  );

  // have to initalize processedCounter to 0 if not already a number
  event.processedCounter =
    event?.processedCounter > 0 ? event.processedCounter : 0;
  event.recursionCounter = isNaN(Number(event?.recursionCounter))
    ? 1
    : Number(event.recursionCounter) + 1;
  let timer: NodeJS.Timeout | undefined;
  try {
    assert(event?.oauth?.businessid, 'businessId cannot be null');
    if (!event.contactSyncId && !event?.ids?.length) {
      const attemptInitiateContactSync = await initiateCRMContactSync({
        userId: event.userId,
        businessId: event.oauth.businessid,
        syncUserId: event.userId,
        accountid: undefined,
        crmId: 16,
        transactionId: String(Logger.transactionId),
        test: !!event.test,
      });
      if (attemptInitiateContactSync?.contactSyncId) {
        event.contactSyncId = attemptInitiateContactSync.contactSyncId;
      } else {
        return CreateResponse.make(
          {
            success: false,
            data: {
              message: 'Could not initiate contact sync.',
            },
          },
          400,
        );
      }
    }
    timer = setTimeout(async () => {
      if (event.contactSyncId) {
        await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
          event.contactSyncId,
          'failed',
          'timedOut',
          JSON.stringify({ message: 'Lambda timed out error' }),
        ]);
      }
    }, 870000);
    await processRequest(event as any, context, logger as Logger, timer);
    return CreateResponse.make('', 200);
  } catch (e) {
    if (event.contactSyncId) {
      await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
        event.contactSyncId,
        'failed',
        'syncError',
        JSON.stringify(e),
      ]);
    }
    Logger.error({
      message: 'HubspotContactSyncError',
      ERROR: e,
    });
    return CreateResponse.make(castError(e), 500);
  } finally {
    clearTimeout(timer);
  }
}

async function processRequest(
  event: THubspotWebhookRequest2,
  context: Context,
  logger: Logger,
  timer: any,
) {
  const outEvent: THubspotWebhookRequest2 = { ...event };
  // contact sync functionality is turned off in prod currently
  const CONTACT_SYNC_DELETE_ENABLED = true;
  if (
    !outEvent.offset &&
    outEvent.delete &&
    CONTACT_SYNC_DELETE_ENABLED &&
    !event?.ids?.length
  ) {
    const deleteRes = await deleteESDDBCRMContacts(
      {
        businessId: event?.oauth?.businessid,
        userId: (event as any).userid,
        syncUserId: (event as any).userid,
        crmId: 16,
        accountid: '',
        transactionId: String(Logger.transactionId),
      },
      context,
      SAFE_EXECUTION_MILLIS_THRESHOLD_2,
    );
    if (deleteRes?.timedOut) {
      clearTimeout(timer);
      await getNextpage(event);
      return;
    }
    outEvent.offset = '0';
  }
  outEvent.transformed = [];
  outEvent.converted = [];
  outEvent.es = [];
  outEvent.contactCounter = 0;
  outEvent.processedCounter =
    outEvent?.processedCounter > 0 ? outEvent.processedCounter : 0;
  outEvent.recursionCounter = outEvent?.recursionCounter
    ? Number(outEvent.recursionCounter + 1)
    : 0;
  logger.info('EVENT', outEvent);
  await refreshToken(outEvent, event.userId, event.oauth.businessid);
  if (event.ids && event.ids.length > 0) {
    await getContactDetailsByIds(outEvent, context);
  } else {
    await getContactDetailsFullSync(outEvent, context, timer);
  }
}

/**
 * Refreshes the OAuth token for a HubSpot integration.
 *
 * This function checks if the OAuth token is present and valid. If the access token is missing or expired,
 * it retrieves a new access token using the refresh token and updates the database with the new token and its expiration time.
 *
 * @param {THubspotWebhookRequest2} event - The event object containing OAuth token information.
 * @throws {Error} If the refresh token is missing or no CRM data is found for the user.
 * @returns {Promise<void>} A promise that resolves when the token refresh process is complete.
 */
export async function refreshToken(
  event: THubspotWebhookRequest2,
  userId: number,
  businessId: number,
): Promise<void> {
  if (!event?.oauth?.token) {
    throw new Error('missing refresh token');
  }
  //if we don't have an access token, we need to get one from the database
  if (!event?.oauth?.accessToken || !event?.oauth?.tokenvaliduntil) {
    const userCRMData = await dbPool.query(
      'call calls.getPortalIdByAccessToken(?);',
      [event.oauth.token],
    );
    if (userCRMData.data.length === 0) {
      throw new Error('No CRM data found for the user');
    }
    event.oauth.accessToken = userCRMData.data[0].accessToken;
    event.oauth.tokenvaliduntil = userCRMData.data[0].tokenvaliduntil;
    event.portalid = userCRMData.data[0]?.['accountid'];
    event.userId = userCRMData.data[0].userid;
  }
  // Check expiration of token
  console.log(
    'accessTokenValidUntil ',
    event.oauth.tokenvaliduntil instanceof Date,
  );

  let tokenValid: boolean = false;

  if (event.oauth?.tokenvaliduntil) {
    const tokenExpirationTime = DateTime.fromJSDate(
      event.oauth?.tokenvaliduntil,
    );

    tokenValid =
      tokenExpirationTime.toMillis() > DateTime.now().toUTC().toMillis();

    console.log('now millis', DateTime.now().toUTC().toMillis());
    console.log('expire millis', tokenExpirationTime.toMillis());
    console.log(
      'is expiration time > now',
      tokenExpirationTime.toMillis() > DateTime.now().toUTC().toMillis(),
    );

    console.log('tokenValid', tokenValid);
    if (tokenValid) {
      console.log('Token is still valid');
      return;
    }
  }

  const CLIENT_ID = getConstant('HUBSPOT_CLIENT_ID');
  const CLIENT_SECRET = getConstant('HUBSPOT_CLIENT_SECRET');
  const REDIRECT_URI = getConstant('HUBSPOT_REDIRECT_URI');
  const LOGIN_URI = getConstant('HUBSPOT_LOGIN_URI');

  let params = 'grant_type=refresh_token';
  params += '&client_id=' + CLIENT_ID;
  params += '&client_secret=' + CLIENT_SECRET;
  params += '&redirect_uri=' + encodeURIComponent(REDIRECT_URI!);
  params += '&refresh_token=' + event.oauth.token;

  let response: AxiosResponse | undefined;
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 8000; // 8 seconds
  const crmLoggerProps: ICRMLoggerProps = {
    requestType: RequestType.axios,
    crmId: 16,
    userId: userId,
    businessId: businessId,
    message: 'refreshToken_ERROR',
    sourceFunction: 'refreshToken',
    sourceFile: 'HubspotgetAllContactsES.ts',
  };
  while (retryCount < maxRetries) {
    try {
      response = await crmLogger(
        async () =>
          await Axios({
            method: 'post',
            url: `https://api.hubapi.com/oauth/v1/token`,
            headers: {
              'cache-control': 'no-cache',
              'content-type': 'application/x-www-form-urlencoded',
            },
            data: params,
          }),
        { ...crmLoggerProps, recursionCounter: retryCount + 1 },
      );
      break; // Exit loop if request is successful
    } catch (error) {
      retryCount++;
      if (retryCount === maxRetries) {
        throw new Error(
          `Failed to fetch token after ${maxRetries} attempts: ${error.message}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay)); // Wait before retrying
    }
  }
  if (!response) {
    throw new Error('Failed to fetch token: response is undefined');
  }
  const jbody = response.data;
  event.oauth.accessToken = jbody.access_token;

  // Calculate accessToken expiration time to update in userCRM table
  const newTokenExpirationTime = DateTime.now()
    .plus({
      seconds: ACCESS_TOKEN_TTL_SECONDS,
    })
    .toUTC();

  // Convert expiration time to JS Date
  const tokenExpirationISO = newTokenExpirationTime.toISO();
  event.oauth.tokenvaliduntil = newTokenExpirationTime.toJSDate();
  console.log({ newTokenExpirationTime, tokenExpirationISO });

  // update accessToken and tokenvaliduntil for the users userCRM row
  console.log('updateUserCrmTokens2', [
    event.userId,
    16,
    event.oauth.accessToken,
    tokenExpirationISO,
  ]);
  try {
    await dbPool.query('call updateUserCrmTokens2(?,?,?,?)', [
      event.userId,
      16,
      event.oauth.accessToken,
      tokenExpirationISO,
    ]);
  } catch (e) {
    console.error(
      'error writing new accessToken and tokenvaliduntil for user in userCRM',
    );
  }
}

async function getContactDetailsByIds(event: any, context: Context) {
  const props = {
    businessid: String(
      event?.oauth?.businessid || event?.oauth?.businessId || '',
    ),
    refreshToken: event.oauth.token,
    userId: event.userId,
    crmID: event.crmID ?? HUBSPOT_CRM_ID,
    selectedRows: null,
  };

  const hubspotPropertiesList = await getHubspotProperties(props);

  if (!hubspotPropertiesList) {
    throw new Error('Failed to fetch Hubspot Properties');
  }

  const hubspotPropertiesListArray = Object.keys(hubspotPropertiesList);

  const hubspotClient = new Client({
    accessToken: event.oauth.accessToken,
  });

  const archived = false;
  let singleRecordResponse: (SimplePublicObject & {
    associations:
      | {
          deals: {
            results: AssociatedId[];
          };
        }
      | AssociatedId[];
  })[] = [];
  let fullSetResponse: typeof singleRecordResponse = [];
  let dealsAssociationsArray: IContactDealAssociation = {};
  let idArray: { id: string }[] = [];
  for (const id of event.ids) {
    idArray.push({ id: id.substring(4) });
  }

  let retryCount = 0;

  const crmLoggerPropsForAssociations: ICRMLoggerProps = {
    requestType: RequestType.sdk,
    crmId: props.crmID,
    userId: props.userId,
    businessId: props.businessid,
    message: 'getContactDetailsByIds_Associations_ERROR',
    sourceFunction: 'getContactDetailsByIds',
    sourceFile: 'HubspotgetAllContactsES.ts',
    processedCounter: event.processedCounter ?? null,
  };

  const crmLoggerPropsForContacts: ICRMLoggerProps = {
    requestType: RequestType.sdk,
    crmId: props.crmID,
    userId: props.userId,
    businessId: props.businessid,
    message: 'getContactDetailsByIds_Contacts_ERROR',
    sourceFunction: 'getContactDetailsByIds',
    sourceFile: 'HubspotgetAllContactsES.ts',
    processedCounter: event.processedCounter ?? null,
  };

  while (retryCount < 3 && singleRecordResponse.length === 0) {
    try {
      crmLoggerPropsForAssociations.recursionCounter = retryCount;
      crmLoggerPropsForContacts.recursionCounter = retryCount;
      //We first fetch the associations of contacts with deals
      const associationsBatchReadInputSimplePublicObjectId = {
        propertiesWithHistory: [],
        idProperty: 'hs_object_id',
        inputs: idArray, // Add the inputs property with the value of idArray
        properties: hubspotPropertiesListArray,
      };
      await refreshToken(event, event.userId, event.oauth.businessid);
      const apiResponseAssociationsSearch = await crmLogger(
        async () =>
          await hubspotClient.crm.associations.batchApi.read(
            'CONTACT',
            'DEAL',
            associationsBatchReadInputSimplePublicObjectId,
          ), // Pass BatchReadInputSimplePublicObjectId as the third argument
        crmLoggerPropsForAssociations,
      );
      if (apiResponseAssociationsSearch.results) {
        for (const apiResponse of apiResponseAssociationsSearch.results) {
          const contactId = apiResponse?._from.id;
          if (apiResponse.to && apiResponse.to.length > 0) {
            if (apiResponse.to[0].type === 'contact_to_deal') {
              const dealIds = apiResponse.to.map((association) => ({
                id: association.id,
                type: association.type,
              }));

              dealsAssociationsArray[Number(contactId)] = dealIds;
            }
          }
        }
      }

      const BatchReadInputSimplePublicObjectId = {
        propertiesWithHistory: [],
        idProperty: 'hs_object_id',
        inputs: idArray,
        properties: hubspotPropertiesListArray,
      };
      await refreshToken(event, event.userId, event.oauth.businessid);
      const apiResponseSearch = await crmLogger(
        async () =>
          await hubspotClient.crm.contacts.batchApi.read(
            BatchReadInputSimplePublicObjectId,
            archived,
          ),
        crmLoggerPropsForContacts,
      );

      if (apiResponseSearch?.results.length === 0) {
        //Throw error if the contact is not found with code 404
        throw { message: 'Contact Not Found', code: '404' };
      }

      for (const contact of apiResponseSearch.results as (SimplePublicObject & {
        associations:
          | {
              deals: { results: AssociatedId[] };
            }
          | AssociatedId[];
      })[]) {
        const contactWithDealAssociations = contact;
        if (dealsAssociationsArray[Number(contact.id)]) {
          contactWithDealAssociations.associations = {
            deals: { results: dealsAssociationsArray[Number(contact.id)] },
          };
        } else {
          contactWithDealAssociations.associations = [];
        }
        singleRecordResponse.push(contactWithDealAssociations);
        fullSetResponse.push(contactWithDealAssociations);
      }
    } catch (err) {
      // If there is an error, retry up to 3 times
      if (err?.response?.status == 429 || err?.code == 429) {
        Logger.error({
          ERROR:
            `Hubspot API call failed. Retrying up to 3 times.` +
            JSON.stringify(err),
          businessid: event?.oauth?.businessid ?? event?.oauth?.businessId,
        });
        retryCount++;
        if (retryCount === 3) {
          await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
            event.contactSyncId,
            'failed',
            `Hubspot API call failed for businessid ${
              event?.oauth?.businessid ?? event?.oauth?.businessId
            }. Retried 3 times. Aborting.`,
            JSON.stringify({ message: err }),
          ]);
          throw new Error(
            `Hubspot API call failed for businessid ${
              event?.oauth?.businessid ?? event?.oauth?.businessId
            }. Retried 3 times. Aborting.` + JSON.stringify(err),
          );
        }
        // Use retry-after header if it exists otherwise default delay is 10 seconds, then 20, then 30
        const retryAfter = parseInt(
          err?.response?.headers?.['retry-after'] ?? 10 * retryCount,
        );
        // Plus random 0-5 seconds so 429 retries do not stack on top of each other
        const delay = retryAfter * 1000 + Math.floor(Math.random() * 5000);
        await sleep(delay);
      } else {
        await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
          event.contactSyncId,
          'failed',
          `Hubspot API call failed for businessid ${
            event?.oauth?.businessid ?? event?.oauth?.businessId
          }.` + (err?.body?.message ?? ''),
          JSON.stringify({ message: err }),
        ]);
        break;
      }
    }
  }

  if (fullSetResponse.length > 0) {
    event.hubspot = { contacts: fullSetResponse };
  }

  const businessId = event?.oauth?.businessid ?? event?.oauth?.businessId;

  if (!event?.externalOwnersToacmeUsersMap && fullSetResponse.length > 0) {
    event.externalOwnersToacmeUsersMap = await getExternalOwnersByBusinessId(
      businessId,
      HUBSPOT_CRM_ID,
    );
  }

  const deals = await getHubspotDealsInBulk({
    accessToken: event.oauth.accessToken,
    dealsAssociationsArray,
    businessId,
    userId: props.userId,
  });

  for (const contact of event?.hubspot?.contacts ?? []) {
    let dealData: SimplePublicObject[] = [];
    if (deals[Number(contact.id)]) {
      dealData = deals[Number(contact.id)];
    }
    const object = {
      contact: contact,
      deals: dealData,
      businessid: event.oauth.businessid,
      portalid: event.portalid,
      externalOwnersToacmeUsersMap: event?.externalOwnersToacmeUsersMap,
      accessToken: event.oauth.accessToken,
    };
    event.transformed.push(await transformContactv3(object));
  }

  for (const transformedObject of event.transformed) {
    const objectWithConvertedPhone = await convertPhones(transformedObject);
    event.converted.push(objectWithConvertedPhone);
    const acmeownerid = transformedObject.acmeownerid ?? null;
    for (const phone of objectWithConvertedPhone?.phone164 ?? []) {
      if (phone?.phone && event.oauth.businessid) {
        await updatePowerlistContactOwner(
          event?.oauth?.businessid ?? event?.oauth?.businessId,
          phone.phone,
          acmeownerid,
        );
      }
    }
  }

  const CRMContactsData: IHubspotContactDataTransformed[] = [];

  for (const val of event.converted) {
    let contact = {} as IHubspotContactDataTransformed;
    contact.contact =
      val.rawContact as IHubspotContactDataTransformed['contact'];
    contact.deals = val.rawDeals as IHubspotContactDataTransformed['deals'];
    CRMContactsData.push(contact);
    delete val.rawContact;
    delete val.rawDeals;
    let id =
      val.businessid + '-' + val.acmecrmid + '-' + parseInt(val.externalid);
    id = hash.sha256().update(id).digest('hex');
    const [doc, upsert] = transformObjForDocAndUpsert(val);
    event.es.push({
      update: {
        _index: process.env.ES_INDEX_CONTACTS,
        _type: 'contact',
        _id: id,
      },
    });
    event.es.push({ doc, upsert });
  }

  const CRMPropertiesEvent: IHubspotSyncEventTransformed = {
    contactSyncId: event.contactSyncId,
    businessid: event?.oauth?.businessid ?? event?.oauth?.businessId,
    crmID: Number(HUBSPOT_CRM_ID),
    origin: 'singleContact',
    userId: event.userId,
    portalId: event.portalid,
    data: CRMContactsData,
  };

  const obj = {
    es: event.es,
    event: { oauth: event.oauth, offset: event.offset },
    hasMore: event.hasMore,
  };

  if (event.es.length > 0) {
    const sendToESResult = await sendToES(obj);
    Logger.info('SEND TO ES RESULT', sendToESResult);

    try {
      const businessCRMPropertiesResponse = await getCRMPropertiesByBusiness({
        businessid: Number(
          event?.oauth?.businessid ?? event?.oauth?.businessId,
        ),
        search: parseInt(HUBSPOT_CRM_ID),
        userId: 0,
      });
      const businessCRMProperties = businessCRMPropertiesResponse?.[0]
        ?.properties
        ? JSON.parse((businessCRMPropertiesResponse as any)[0].properties)
        : [];
      const businessCRMPropertiesPhoneArr = businessCRMProperties
        .filter(
          (property: {
            module: 'Lead' | 'Contact' | 'Deal';
            contactPropertyId: number;
            name: string;
            label: string;
            status: string;
            lastImported: string;
            selected?: boolean;
            phone?: boolean;
            defaultPhone?: boolean;
          }) => property?.phone || property?.defaultPhone,
        )
        .map(
          (property: {
            module: 'Lead' | 'Contact' | 'Deal';
            contactPropertyId: number;
            name: string;
            label: string;
            status: string;
            lastImported: string;
            selected?: boolean;
            phone?: boolean;
            defaultPhone?: boolean;
          }) => {
            return {
              ...property,
              name:
                property?.module === 'Lead'
                  ? property.name?.slice(5)
                  : property?.name,
            };
          },
        );

      CRMPropertiesEvent.phoneFieldArr = businessCRMPropertiesPhoneArr;
      const sendToCRMPropertiesResult = await sendToHubspotCRMProperties(
        CRMPropertiesEvent,
        context,
      );
    } catch (e) {
      Logger.error({
        message: 'Hubspot - Error sending to CRM Properties',
        ERROR: e,
      });
    }
  }
}

async function getContactDetailsFullSync(
  event: THubspotWebhookRequest2,
  context: Context,
  timer: any,
) {
  new Logger({ event, context });

  //Fetching the status of the contact sync record to make sure that the sync is not aborted by user manually
  if (event.contactSyncId) {
    const contactSyncStatus = await dbPool.query('call getCRMContactSync(?)', [
      event.contactSyncId,
    ]);
    if (contactSyncStatus.data[0].status === 'aborted') {
      Logger.info('Contact Sync Aborted by User');
      return;
    }
  }

  const props = {
    businessid: String(
      event?.oauth?.businessid ?? event?.oauth?.businessId ?? '',
    ),
    refreshToken: event.oauth.token,
    userId: event.userId,
    crmID: event.crmID ?? HUBSPOT_CRM_ID,
    selectedRows: null,
  };

  const hubspotPropertiesList = await getHubspotProperties(props);

  if (!hubspotPropertiesList) {
    throw new Error('Failed to fetch Hubspot Properties');
  }

  const hubspotPropertiesListArray = Object.keys(hubspotPropertiesList);
  let status = 'started';
  while (
    context.getRemainingTimeInMillis() > SAFE_EXECUTION_MILLIS_THRESHOLD_2 &&
    status === 'started'
  ) {
    await refreshToken(event, event.userId, event.oauth.businessid);
    let apiResponse: CollectionResponseSimplePublicObjectWithAssociationsForwardPaging | null =
      null;

    const propertiesWithHistory: string[] | undefined = undefined;
    const associations: string[] | undefined = ['Deals'];
    const archived = false;
    let retryCount = 0;
    const finalResults: (SimplePublicObject & {
      associations:
        | {
            deals: {
              results: AssociatedId[];
            };
          }
        | AssociatedId[];
    })[] = [];
    let dealsAssociationsArray: IContactDealAssociation = {};
    const hubspotClient = new Client({
      accessToken: event.oauth.accessToken,
    });

    const crmLoggerPropsForPagesOfContacts: ICRMLoggerProps = {
      requestType: RequestType.sdk,
      crmId: +HUBSPOT_CRM_ID,
      userId: event.userId,
      businessId: +event?.oauth?.businessid,
      message: 'getContactDetailsFullSync_ContactPages_ERROR',
      sourceFunction: 'getContactDetailsFullSync',
      sourceFile: 'HubspotgetAllContactsES.ts',
      processedCounter: event.processedCounter ?? null,
    };

    const crmLoggerPropsForContacts: ICRMLoggerProps = {
      requestType: RequestType.sdk,
      crmId: +HUBSPOT_CRM_ID,
      userId: event.userId,
      businessId: +event?.oauth?.businessid,
      message: 'getContactDetailsFullSync_ContactDetails_ERROR',
      sourceFunction: 'getContactDetailsFullSync',
      sourceFile: 'HubspotgetAllContactsES.ts',
      processedCounter: event.processedCounter ?? null,
    };

    while (retryCount < 3 && apiResponse === null) {
      Logger.info('retryCount', retryCount + 1);
      apiResponse = null;
      try {
        const limit = 100;
        const after = event.offset === '' ? '0' : event.offset.toString();
        console.log('after', after);

        crmLoggerPropsForPagesOfContacts.recursionCounter = retryCount;
        crmLoggerPropsForContacts.recursionCounter = retryCount;
        //We first fetch the contacts without properties to get the 100 contacts with associations of deals
        await refreshToken(event, event.userId, event.oauth.businessid);
        apiResponse = await crmLogger(
          async () =>
            await hubspotClient.crm.contacts.basicApi.getPage(
              limit,
              after,
              ['id'],
              propertiesWithHistory,
              associations,
              archived,
            ),
          crmLoggerPropsForPagesOfContacts,
        );

        let idArray: { id: string }[] = [];
        for (const contact of apiResponse.results) {
          idArray.push({ id: contact.id.toString() });
          if (contact.associations?.deals) {
            dealsAssociationsArray[Number(contact.id)] =
              contact.associations.deals.results;
          }
        }

        const BatchReadInputSimplePublicObjectId = {
          propertiesWithHistory: [],
          idProperty: 'hs_object_id',
          inputs: idArray,
          properties: hubspotPropertiesListArray,
        };
        await refreshToken(event, event.userId, event.oauth.businessid);
        const apiResponseSearch = await crmLogger(
          async () =>
            await hubspotClient.crm.contacts.batchApi.read(
              BatchReadInputSimplePublicObjectId,
              archived,
            ),
          crmLoggerPropsForContacts,
        );

        for (const contact of apiResponseSearch.results as (SimplePublicObject & {
          associations:
            | {
                deals: { results: AssociatedId[] };
              }
            | AssociatedId[];
        })[]) {
          const contactWithDealAssociations = contact;
          if (dealsAssociationsArray[Number(contact.id)]) {
            contactWithDealAssociations.associations = {
              deals: { results: dealsAssociationsArray[Number(contact.id)] },
            };
            console.log('contact.id', contact.id);
          } else {
            contactWithDealAssociations.associations = [];
          }
          finalResults.push(contactWithDealAssociations);
        }

        event.contactCounter =
          event.contactCounter + apiResponse.results.length;
        Logger.info('CONTACT COUNTER', event.contactCounter);
        event.hubspot = { results: finalResults };
      } catch (err) {
        console.error('HubSpot Full Sync Error', err);
        // If there is an error, retry up to 3 times
        if (err?.response?.status == 429 || err?.code == 429) {
          Logger.error({
            ERROR:
              `Hubspot API call failed. Retrying up to 3 times.` +
              JSON.stringify(err),
            businessid: event?.oauth?.businessid ?? event?.oauth?.businessId,
          });
          retryCount++;
          if (retryCount === 3) {
            throw new Error(
              `Hubspot API call failed for businessid ${
                event?.oauth?.businessid ?? event?.oauth?.businessId
              }. Retried 3 times. Aborting.` + JSON.stringify(err),
            );
          }
          // Use retry-after header if it exists otherwise default delay is 10 seconds, then 20, then 30
          const retryAfter = parseInt(
            err?.response?.headers?.['retry-after'] ?? 10 * retryCount,
          );
          // Plus random 0-5 seconds so 429 retries do not stack on top of each other
          const delay = retryAfter * 1000 + Math.floor(Math.random() * 5000);
          await sleep(delay);
        } else {
          break;
        }
      }
    }
    if (apiResponse?.paging?.next?.after) {
      event.offset = apiResponse?.paging?.next?.after;
      event.hasMore = true;
    } else {
      event.hasMore = false;
    }

    const businessId = event?.oauth?.businessid ?? event?.oauth?.businessId;

    if (!event?.externalOwnersToacmeUsersMap) {
      event.externalOwnersToacmeUsersMap = await getExternalOwnersByBusinessId(
        String(businessId),
        HUBSPOT_CRM_ID,
      );
    }

    const deals = await getHubspotDealsInBulk({
      accessToken: event.oauth.accessToken,
      dealsAssociationsArray,
      businessId: String(businessId),
      userId: event.userId,
    });

    for (const contact of event?.hubspot?.results ?? []) {
      let dealData: SimplePublicObject[] = [];
      if (deals[Number(contact.id)]) {
        dealData = deals[Number(contact.id)];
      }
      const object = {
        contact: contact,
        deals: dealData,
        businessid: event.oauth.businessid,
        portalid: event.portalid,
        externalOwnersToacmeUsersMap: event?.externalOwnersToacmeUsersMap,
        accessToken: event.oauth.accessToken,
      };
      event.transformed.push(await transformContactv3(object));
    }

    for (const transformedObject of event.transformed) {
      const convertedPhone = await convertPhones(transformedObject);
      event.converted.push(convertedPhone);
      const acmeownerid = (transformedObject as any).acmeownerid;
      for (const phone of convertedPhone?.phone164 ?? []) {
        if (acmeownerid != '' && phone?.phone && event.oauth.businessid) {
          const result = await updatePowerlistContactOwner(
            event.oauth.businessid.toString(),
            phone.phone,
            acmeownerid,
          );
        }
      }
    }
    const CRMContactsData: IHubspotContactDataTransformed[] = [];

    event.processedCounter += event.converted?.length | 0;
    Logger.info(
      'BID',
      event.oauth.businessid,
      'Portalid',
      event?.portalid,
      'PROCESSED COUNTER ',
      event.processedCounter,
      'Contact Counter',
      event?.contactCounter,
      'recursionCounter',
      event?.recursionCounter,
    );
    for (const val of event.converted) {
      let contact = {} as IHubspotContactDataTransformed;
      contact.contact = (
        val as { rawContact: IHubspotContactDataTransformed['contact'] }
      ).rawContact;
      contact.deals = (
        val as { rawDeals: IHubspotContactDataTransformed['deals'] }
      ).rawDeals;
      CRMContactsData.push(contact);
      if (!event.es) {
        event.es = [];
      }

      delete (val as { rawContact: unknown }).rawContact;
      delete (val as { rawDeals: unknown }).rawDeals;
      let id =
        (val as { businessid: string }).businessid +
        '-' +
        (val as { acmecrmid: string }).acmecrmid +
        '-' +
        parseInt((val as { externalid: string }).externalid);
      id = hash.sha256().update(id).digest('hex');
      const [doc, upsert] = transformObjForDocAndUpsert(val);
      event.es.push({
        update: {
          _index: process.env.ES_INDEX_CONTACTS,
          _type: 'contact',
          _id: id,
        },
      });
      event.es.push({ doc, upsert });
    }

    const CRMPropertiesEvent: IHubspotSyncEventTransformed = {
      businessid: String(event.oauth.businessid),
      crmID: Number(HUBSPOT_CRM_ID),
      origin: 'fullSync',
      userId: event.userId,
      portalId: event.portalid,
      data: CRMContactsData,
      contactSyncId: event.contactSyncId,
    };

    const obj = {
      es: event.es || [], // Add a default value of an empty array if event.es is undefined
      event: { oauth: event.oauth, offset: event.offset },
      hasMore: event.hasMore,
    };

    if (obj.es.length > 0) {
      // Use obj.es instead of event.es
      const businessCRMPropertiesResponse = await getCRMPropertiesByBusiness({
        businessid: Number(
          event?.oauth?.businessid ?? event?.oauth?.businessId,
        ),
        search: parseInt(HUBSPOT_CRM_ID),
        userId: 0,
      });
      const businessCRMProperties = businessCRMPropertiesResponse?.[0]
        ?.properties
        ? JSON.parse((businessCRMPropertiesResponse as any)[0].properties)
        : [];
      const businessCRMPropertiesPhoneArr = businessCRMProperties
        .filter(
          (property: {
            module: 'Lead' | 'Contact' | 'Deal';
            contactPropertyId: number;
            name: string;
            label: string;
            status: string;
            lastImported: string;
            selected?: boolean;
            phone?: boolean;
            defaultPhone?: boolean;
          }) => property?.phone || property?.defaultPhone,
        )
        .map(
          (property: {
            module: 'Lead' | 'Contact' | 'Deal';
            contactPropertyId: number;
            name: string;
            label: string;
            status: string;
            lastImported: string;
            selected?: boolean;
            phone?: boolean;
            defaultPhone?: boolean;
          }) => {
            return {
              ...property,
              name:
                property?.module === 'Lead'
                  ? property.name?.slice(5)
                  : property?.name,
            };
          },
        );

      const sendToESResult = await sendToES(obj);
      //Omid - We decided to ignore any errors from sending to dynamodb
      try {
        CRMPropertiesEvent.phoneFieldArr = businessCRMPropertiesPhoneArr;
        const sendToCRMPropertiesResult = await sendToHubspotCRMProperties(
          CRMPropertiesEvent,
          context,
        );
      } catch (e) {
        Logger.error({
          message: 'Hubspot - Error sending to CRM Properties',
          ERROR: e,
        });
      }
      const {
        data: [syncData],
      } = await dbPool.query('call updateContactSyncProgress(?,?,?)', [
        event.contactSyncId,
        apiResponse?.results?.length ?? 0,
        0,
      ]);
      if (event.contactSyncId) {
        status = await getContactSyncStatus2(event.contactSyncId);
        if (status !== 'started') {
          if (status === 'completed') {
            return;
          }
          throw new Error(
            `contact sync not active for id: ${event.contactSyncId}, bid: ${
              event?.oauth?.businessid ?? event?.oauth?.businessId
            }`,
          );
        }
      }
      Logger.warn(
        'BID',
        event?.oauth?.businessid ?? event?.oauth?.businessId,
        'CRMID',
        HUBSPOT_CRM_ID,
        'PortalID',
        event?.portalid,
        'RecursionCount',
        event?.recursionCounter,
        'SyncedCount',
        syncData?.syncedCount,
        'TotalSynced',
        syncData?.totalSynced,
      );
    }

    event.transformed = [];
    event.converted = [];
    event.es = [];
    event.hubspot = { results: [] };

    if (!apiResponse?.paging?.next?.after) {
      event.hasMore = false;
      break;
    }
    await sleep(1000);
  }
  if (event.hasMore) {
    if (event.contactSyncId) {
      await dbPool.query('call updateContactSyncProgress(?,?,?)', [
        event.contactSyncId,
        0,
        1,
      ]);
    }
    clearTimeout(timer);
    await getNextpage(event);
  } else {
    if (event.contactSyncId) {
      await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
        event.contactSyncId,
        'completed',
        null,
        null,
      ]);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
async function transformContactv3(event: any) {
  const contact = event.contact;
  const portalid = event.portalid;
  const out: any = {};
  out.name = {};
  out.company = {};
  out.emails = [];
  out.phones = [];
  out.phone164 = [];
  out.addresses = [];
  out.crmlinks = {};
  const p = contact.properties;
  out.created_at = formatDate(new Date());
  out['acmecrmid'] = HUBSPOT_CRM_ID;
  out['crmname'] = 'hubspot';
  out['businessid'] = parseInt(event.businessid);
  out.ownerid = '';
  //externalid
  out['externalid'] = parseInt(contact['id']);
  out['rawContact'] = event.contact;
  out['rawDeals'] = event.deals;
  out.deals = {};

  //weblink
  //out.crmlinks.weblink= contact['profile-url'];
  out.crmlinks.weblink = `https://app.hubspot.com/contacts/${portalid}/contact/${contact['id']}/`;

  if (p.hubspot_owner_id) {
    out.ownerid = p.hubspot_owner_id;
    if (out.ownerid && out.ownerid != '') {
      //out.acmeownerid = await getacmeOwner(out.ownerid, out['businessid']);
      out.acmeownerid =
        event?.externalOwnersToacmeUsersMap[out.ownerid]?.toString() || '';
    } else {
      out.acmeownerid = '';
    }
  } else {
    out.acmeownerid = '';
  }

  //name
  if (p['firstname']) {
    out.name.firstName = p.firstname;
  }
  if (p['lastname']) {
    out.name.lastName = p.lastname;
  }

  //company
  /*if(p['company']){
            out.company.name = p.company.value;
        }*/
  if (p['associatedcompanyid']) {
    out.company.id = p.associatedcompanyid;
  }

  //email
  if (p['email']) {
    out['emails'].push({ type: 'none', email: p['email'] });
  }

  //phones
  if (p['phone']) {
    out['phones'].push({ type: 'phone', phone: p['phone'] });
  }
  if (p['mobilephone']) {
    out['phones'].push({ type: 'mobile phone', phone: p['mobilephone'] });
  }

  //addresses
  if (p['address'] || p['city'] || p['state'] || p['zip']) {
    out['addresses'].push({ type: 'none' });
    const l = out['addresses'].length - 1;
    out['addresses'][l]['address'] = {};
    out['addresses'][l]['address']['street'] = p['address']
      ? p['address']['value']
      : '';
    out['addresses'][l]['address']['city'] = p['city']
      ? p['city']['value']
      : '';
    out['addresses'][l]['address']['state'] = p['state']
      ? p['state']['value']
      : '';
    out['addresses'][l]['address']['zip'] = p['zip'] ? p['zip']['value'] : '';
  }

  if (event?.deals && event?.deals?.length > 0) {
    const deals = transformDeals(event.deals, portalid);
    // ENG-5493
    // IF multiple deals exist for the contact
    // store the deal data for the deal that has the
    // latest “hs_lastmodifieddate” AND deal status of “open”
    if (deals?.length > 1) {
      let openDeals = deals.filter((deal) => deal?.acmeStatus === 'open');
      if (openDeals?.length) {
        openDeals = openDeals.sort((a, b) =>
          (a?.lastModified ?? '') > (b?.lastModified ?? '') ? -1 : 1,
        );
        out.deals = openDeals[0];
      }
    }
    if (!out.deals) {
      out.deals = deals[0];
    }
  }

  return out;
}

function transformDeals(deals: any, portalid: string) {
  const dealsTransformed: IHubspotDealData[] = deals.map((deal: any) => {
    return {
      pipeline: deal.properties['pipeline'],
      stage: deal.properties['dealstage'],
      link: `https://app.hubspot.com/deals/${portalid}/deal/${deal.id}}/`,
      name: deal.properties['dealname'],
      id: `${deal.id}`,
      title: deal.properties['title'],
      ownerid: deal.properties['hubspot_owner_id'],
      created: deal.properties['createdate'],
      lastModified: deal.properties['hs_lastmodifieddate'],
      value: Number(deal.properties['amount']),
      stageid: undefined,
      status: undefined,
      acmeStatus:
        deal.properties['dealstage'] === 'lost' ||
        deal.properties['dealstage'] === 'won' ||
        deal.properties['dealstage'] === 'closed'
          ? 'closed'
          : 'open',
    };
  });
  return dealsTransformed;
}

function convertPhones(obj: any) {
  obj.phone164 = _.cloneDeep(obj.phones);
  obj.phone164 = _.map(obj.phone164, convertToe164);
  return obj;
  //sendToES(event, context, callback);
}

async function sendToES(e: any) {
  // Set the Elasticsearch credentials, region
  const client = await getElasticSearchClient();
  const res = await client.bulk({
    pipeline: 'contacts_pipeline',
    body: e.es,
  });
  return res;
}

async function getNextpage(event: any) {
  const lambda = new LambdaClient({
    region: getConstant('LAMBDA_REGION'),
    credentials: {
      accessKeyId: getConstant('AWS_LAMBDA_ACCESS_KEY_ID'),
      secretAccessKey: getConstant('AWS_LAMBDA_ACCESS_KEY_SECRET'),
    },
  });

  // lambda.invoke(
  //   {
  //     FunctionName: HubspotgetAllContactsESFunctionName,
  //     Payload: JSON.stringify(event, null, 2), // pass params
  //     InvocationType: 'Event',
  //   },
  //   function (error, data) {
  //     if (error) {
  //       console.error('failed to get more', JSON.stringify(error));
  //       return false;
  //     } else {
  //       return true;
  //     }
  //   }
  // );

  console.log(
    'FULL Contact Sync BEFORE',
    'BID',
    event?.oauth?.businessid,
    'event',
    JSON.stringify(event),
  );

  try {
    const lambdaResponse = await lambda.send(
      new InvokeCommand({
        FunctionName: hubspotGetAllContactsFunctionName,
        Payload: JSON.stringify(event) as any, // pass params
        InvocationType: 'Event',
      }),
    );

    // console.log('event', JSON.stringify(event));
    console.log(`lambdaResponse ${JSON.stringify(lambdaResponse)}`);
  } catch (e) {
    console.error(
      'ERROR:: Failed to call next page and triggering the lambda again.',
      `Business ID ${event?.oauth?.businessid}`,
      JSON.stringify(e),
    );
    throw e;
  }
}

//##################################################

function padTo2Digits(num: number) {
  return num.toString().padStart(2, '0');
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDate(date: Date) {
  return (
    [
      date.getFullYear(),
      padTo2Digits(date.getMonth() + 1),
      padTo2Digits(date.getDate()),
    ].join('-') +
    ' ' +
    [
      padTo2Digits(date.getHours()),
      padTo2Digits(date.getMinutes()),
      padTo2Digits(date.getSeconds()),
    ].join(':')
  );
}

async function getExternalOwnersByBusinessId(
  businessId: string,
  crmID: string,
) {
  try {
    const mapRecord = {} as any;
    if (businessId) {
      const results = await dbPool.query(
        'call getExternalOwnersByBusinessId(?,?);',
        [businessId, crmID],
      );

      for (const record of results.data) {
        mapRecord[record.externalOwnerid] = record.userid;
      }
    }
    return mapRecord;
  } catch (e) {
    console.error(
      'updatePowerlistContactOwnerByBusinessIdPhone Failed',
      JSON.stringify(e),
    );
    throw e;
  }
}

async function updatePowerlistContactOwner(
  businessId: string,
  phoneNumber164: string,
  ownerUserId: string,
) {
  try {
    if (businessId && phoneNumber164) {
      const powerlistContactOwnerUserId = ownerUserId ? ownerUserId : null;
      await dbPool.queryAsync(
        'call updatePowerlistContactOwnerByBusinessIdPhone(?,?,?);',
        [businessId, phoneNumber164, powerlistContactOwnerUserId],
      );
    }
  } catch (e) {
    console.error(
      'updatePowerlistContactOwnerByBusinessIdPhone Failed',
      JSON.stringify(e),
    );
  }
}

```