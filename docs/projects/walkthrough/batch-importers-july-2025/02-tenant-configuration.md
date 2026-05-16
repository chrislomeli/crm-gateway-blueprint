# Tenant Configuration for Batch Importers

This guide explains how tenant configuration works in the Blueprint batch processing system and how to set up new tenants for your batch importers.

## Understanding Tenant Configuration

In Blueprint, a "tenant" represents a customer or organization with their own isolated data. The `batch_tenants` table stores configuration for each tenant, including:

- Which CRM system they use
- Authentication credentials for that CRM
- Import schedule and preferences
- Status and metadata

## Tenant Database Schema

The `batch_tenants` table has the following key fields:

| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| business_id | varchar | Unique identifier for the tenant |
| crm_type | varchar | Type of CRM (e.g., 'hubspoof', 'gohio') |
| crm_info | JSON | CRM-specific configuration (API keys, endpoints, etc.) |
| status | varchar | Current status ('ACTIVE', 'INACTIVE', etc.) |
| last_import_at | timestamp | When the last import was performed |
| created_at | timestamp | When the tenant was created |
| updated_at | timestamp | When the tenant was last updated |

## Viewing Existing Tenants

To view existing tenants in your local environment:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, crm_type, status FROM batch_tenants;"
```

For more detailed information, including the CRM-specific configuration:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, crm_type, crm_info, status FROM batch_tenants;"
```

## Adding a New Tenant

You can add a new tenant directly to the database:

```bash
docker exec crmdb crmdb -uroot -proot event -e "INSERT INTO batch_tenants (business_id, crm_type, crm_info, status) VALUES ('12345', 'hubspoof', '{\"apiKey\": \"test-key-12345\", \"endpoint\": \"http://fake-crm-api:3000/api/v1\"}', 'ACTIVE');"
```

### CRM-Specific Configuration

The `crm_info` field is a JSON object that contains CRM-specific configuration. The structure depends on the CRM type:

#### Hubspoof Example

```json
{
  "apiKey": "test-key-12345",
  "endpoint": "http://fake-crm-api:3000/api/v1"
}
```

#### Generic Structure

When creating your own importer, you should define what configuration your importer needs:

```json
{
  "apiKey": "your-api-key",
  "endpoint": "https://api.example.com",
  "username": "optional-username",
  "password": "optional-password",
  "options": {
    "customField1": "value1",
    "customField2": "value2"
  }
}
```

## Tenant Initialization

In a production environment, tenants would typically be created through an onboarding process. For local development, tenants are initialized in two ways:

1. **Database Initialization Scripts**: Located in `infrastructure/local/docker/mysql/init/05-batch-seed-tenants.sql`

2. **Manual Creation**: Using SQL commands as shown above

## Tenant Status Management

Tenants can have different statuses:

- `ACTIVE`: Ready for importing
- `INACTIVE`: Temporarily disabled
- `ERROR`: Previous import failed
- `PENDING`: Awaiting configuration

Only tenants with `ACTIVE` status will be processed by the batch dispatcher.

To update a tenant's status:

```bash
docker exec crmdb crmdb -uroot -proot event -e "UPDATE batch_tenants SET status = 'INACTIVE' WHERE business_id = '12345';"
```

## Security Considerations

In a production environment, sensitive information in `crm_info` (like API keys and passwords) should be stored securely:

1. Use AWS Secrets Manager or Parameter Store for credentials
2. Store only references to secrets in the database
3. Encrypt sensitive data at rest

For local development, plain text values are acceptable, but never commit real credentials to source control.

## Next Steps

Now that you understand tenant configuration, proceed to [Exploring the Hubspoof Importer Example](03-hubspoof-example.md) to see how an importer uses this configuration.
