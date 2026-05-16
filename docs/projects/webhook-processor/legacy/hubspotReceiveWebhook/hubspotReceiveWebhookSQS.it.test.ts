import {
  Context,
  Callback,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSEvent,
  ScheduledEvent,
} from 'aws-lambda';
import * as hubspotReceiveWebhook from './hubspotReceiveWebhook';
import * as hubspotReceiveWebhookSQS from '../hubspotSQSReceiver/hubspotSQSReceiver2ES';

const updateMock = [
  {
    eventId: 1000019079,
    subscriptionId: 26411,
    portalId: 6283166,
    appId: 35569,
    occurredAt: 1621729157918,
    subscriptionType: 'contact.creation',
    attemptNumber: 0,
    objectId: 951651,
    propertyName: 'name',
    propertyValue: '98f4c947-9120-45a2-86a7-8ee8f66bdde5',
    changeSource: 'IMPORT',
  },
];

const deleteMock = [
  {
    eventId: 3954900157,
    subscriptionId: 5131,
    portalId: 6283166,
    appId: 35569,
    occurredAt: 1625098935726,
    subscriptionType: 'contact.deletion',
    attemptNumber: 0,
    objectId: 951651,
    changeFlag: 'DELETED',
    changeSource: 'CONTACTS',
  },
];

const updateSQSProcessMock = {
  Records: [
    {
      messageId: '19dd0b57-b21e-4ac1-bd88-01bbb068cb78',
      receiptHandle: 'MessageReceiptHandle',
      body: '{"portalId":"6283166","objectId":5588917839,"type":"new","entity":"deal"}',
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1523232000000',
        SenderId: '123456789012',
        ApproximateFirstReceiveTimestamp: '1523232000001',
      },
    },
  ],
};

describe('Unit test for app handler', function () {
  it('verifies successful response', async () => {
    let event: APIGatewayProxyEvent = updateMock as any;
    let context: Context = {} as any;
    let callback: Callback = {} as any;
    const result = await hubspotReceiveWebhook.handler(event, context);
    // console.log(result);
  });
});

describe('Unit test for app handler', function () {
  it('verifies successful response', async () => {
    let event: APIGatewayProxyEvent = deleteMock as any;
    let context: Context = {} as any;
    let callback: Callback = {} as any;
    const result = await hubspotReceiveWebhook.handler(event, context);
    // console.log(result);
  });
});

describe('Unit test for app handler', function () {
  it.only('verifies successful response', async () => {
    let event: APIGatewayProxyEvent = updateMock as any;
    let context: Context = {} as any;
    let callback: Callback = {} as any;
    const result = await hubspotReceiveWebhookSQS.handler(
      updateSQSProcessMock,
      context
    );
    // console.log(result);
  });
});
