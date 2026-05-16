# Webhook payload
```json
{
  "eventId": 1234567891,
  "subscriptionId": 456,
  "portalId": 67890,
  "appId": 9876,
  "occurredAt": 1689719332212,
  "subscriptionType": "contact.propertyChange",
  "objectId": 1122334455,
  "propertyName": "myScore",
  "propertyValue": "95",
  "changeSource": "CRM",
  "eventIdSignature": "base64hash",
  "attemptNumber": 0
}
```

```json
{
  "businessId": 995,
  "intentFieldName": "myScore",
  "intentFieldLabel": "My Score",
  "intentScoreThreshold": 80
}
```


```json
{
  "event": {
    "eventId": 1234567891,
    "subscriptionId": 456,
    "portalId": 67890,
    "appId": 9876,
    "occurredAt": 1689719332212,
    "subscriptionType": "contact.propertyChange",
    "objectId": 1122334455,
    "propertyName": "myScore",
    "propertyValue": "95",
    "changeSource": "CRM",
    "eventIdSignature": "base64hash",
    "attemptNumber": 0
  },
  "intenet": {
    "businessId": 995,
    "intentFieldName": "myScore",
    "intentFieldLabel": "My Score",
    "intentScoreThreshold": 80
  }
}
```


```
GET /crm/v3/objects/contacts/1122334455?properties=hubspot_owner_id
```
response
```json
{
  "id": "1122334455",
  "properties": {
    "hubspot_owner_id": "46320123"
  }
}
```



| Subscription type | Scope required              | Description                                                                                                                                                                |
|-------------------|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| contact.creation | crm.objects.contacts.read   | Get notified if any contact is created in a customer's account.                                                                                                            |
| contact.deletion | crm.objects.contacts.read   | Get notified if any contact is deleted in a customer's account.                                                                                                            |
| contact.merge | crm.objects.contacts.read   | Get notified if a contact is merged with another.                                                                                                                          |
| contact.associationChange | crm.objects.contacts.read   | Get notified if a contact has an association added or removed between itself and another supported webhook object (contact, company, deal, ticket, line item, or product). |
| contact.restore | crm.objects.contacts.read   | Get notified if a contact is restored from deletion.                                                                                                                       |
| contact.privacyDeletion | crm.objects.contacts.read   | Get notified if a contact is deleted for privacy compliance reasons.                                                                                                       |
| contact.propertyChange | crm.objects.contacts.read   | Get notified if a specified property is changed for any contact in an account.                                                                                             |
