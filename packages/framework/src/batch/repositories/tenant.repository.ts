/**
 * Tenant Repository - Manages CRM tenant accounts and their configurations
 * 
 * Provides methods for creating, updating, and querying tenant information
 * with proper relationship management to jobs and CRM systems.
 */

import { PostgreSQLService } from '@platform/connectors';
import { logger } from '@platform/core';
import { Tenant, CreateTenantInput } from './types';

export class TenantRepository {
    /**
     * Create a new tenant
     */
    async createTenant(input: CreateTenantInput): Promise<Tenant> {
        const query = `
            INSERT INTO tenants (
                business_id, account_id, crm_id, tenant_name, config, status
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        const params = [
            input.business_id,
            input.account_id,
            input.crm_id,
            input.tenant_name,
            input.config ? JSON.stringify(input.config) : null,
            'active'
        ];

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, params);
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to create tenant: ${result.error?.message || 'No rows returned'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                accountId: tenant.account_id 
            }, 'Tenant created successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, input }, 'Failed to create tenant');
            throw error;
        }
    }

    /**
     * Get tenant by CRM account ID
     */
    async getTenantByAccountId(accountId: string): Promise<Tenant | null> {
        const query = 'SELECT * FROM tenants WHERE account_id = $1 AND status != $2;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, [accountId, 'deleted']);
            
            if (!result.success) {
                throw new Error(`Failed to get tenant by account ID: ${result.error?.message}`);
            }

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            logger.error({ error, accountId }, 'Failed to get tenant by account ID');
            throw error;
        }
    }

    /**
     * Get tenant by business ID (our internal ID)
     */
    async getTenantByBusinessId(businessId: string): Promise<Tenant | null> {
        const query = 'SELECT * FROM tenants WHERE business_id = $1 AND status != $2;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, [businessId, 'deleted']);
            
            if (!result.success) {
                throw new Error(`Failed to get tenant by business ID: ${result.error?.message}`);
            }

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            logger.error({ error, businessId }, 'Failed to get tenant by business ID');
            throw error;
        }
    }

    /**
     * Change CRM system for a tenant (migration scenario)
     */
    async changeCrm(businessId: string, newAccountId: string, newCrmId: number): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET account_id = $2, crm_id = $3, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $4
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, newAccountId, newCrmId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to change CRM: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                newAccountId, 
                newCrmId 
            }, 'Tenant CRM changed successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, newAccountId, newCrmId }, 'Failed to change CRM');
            throw error;
        }
    }

    /**
     * Update the last job ID for a tenant
     */
    async updateLastJob(businessId: string, jobId: string): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET last_job_id = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $3
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, jobId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update last job: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.debug({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                jobId 
            }, 'Tenant last job updated');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, jobId }, 'Failed to update last job');
            throw error;
        }
    }

    /**
     * Get all active tenants (useful for batch processing)
     */
    async getActiveTenants(): Promise<Tenant[]> {
        const query = 'SELECT * FROM tenants WHERE status = $1 ORDER BY created_at;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, ['active']);
            
            if (!result.success) {
                throw new Error(`Failed to get active tenants: ${result.error?.message}`);
            }

            return result.rows;
        } catch (error) {
            logger.error({ error }, 'Failed to get active tenants');
            throw error;
        }
    }

    /**
     * Update tenant configuration
     */
    async updateTenantConfig(businessId: string, config: Record<string, any>): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET config = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $3
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, JSON.stringify(config), 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update tenant config: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id 
            }, 'Tenant config updated');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, config }, 'Failed to update tenant config');
            throw error;
        }
    }

    /**
     * Soft delete a tenant (set status to 'deleted')
     */
    async deleteTenant(businessId: string): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET status = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $2
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to delete tenant: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id 
            }, 'Tenant deleted successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId }, 'Failed to delete tenant');
            throw error;
        }
    }
}
