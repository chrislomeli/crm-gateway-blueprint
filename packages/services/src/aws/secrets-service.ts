/**
 * SecretsService - AWS Secrets Manager Integration
 * 
 * This service provides a standardized interface for interacting with AWS Secrets Manager.
 * It handles secure storage and retrieval of sensitive information like API keys and credentials.
 * 
 * Key features:
 * - Singleton pattern for Secrets Manager client to minimize connection overhead
 * - Environment-aware configuration (works with local development and AWS)
 * - Comprehensive error handling using the Result pattern
 * - Support for versioned secrets
 * - Secret caching to reduce API calls
 * - Tag-based secret organization
 * 
 * This service is a core component of the Blueprint security framework,
 * ensuring sensitive information is never hardcoded in application code
 * and can be rotated without application changes.
 * 
 * @module aws/SecretsService
 */

import {
    GetSecretValueCommand,
    ListSecretsCommand,
    PutSecretValueCommand,
    CreateSecretCommand,
    UpdateSecretCommand,
    SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
import { Result, success, failure, createError, isFailure, logger, getErrorInfo } from '@platform/core';
import { AwsClientFactory } from './aws-client-factory';

/**
 * Secrets Service for interacting with AWS Secrets Manager
 * Provides static methods for fetching and pushing secrets
 */
export class SecretsService {
    /**
     * Singleton instance of the Secrets Manager client
     * Will be lazily initialized when needed
     */
    private static secretsManagerClientInstance: SecretsManagerClient | null = null;
    
    /**
     * Get a singleton instance of the Secrets Manager client
     * Creates the client if it doesn't exist
     */
    private static getSecretsManagerClient(): SecretsManagerClient {
        if (!this.secretsManagerClientInstance) {
            this.secretsManagerClientInstance = this.createSecretsManagerClient();
        }
        
        return this.secretsManagerClientInstance;
    }
    
    /**
     * Create a new Secrets Manager client with appropriate configuration
     * based on the current environment
     */
    private static createSecretsManagerClient(): SecretsManagerClient {
        try {
            logger.info('SecretsService: Creating client');
            return AwsClientFactory.createSecretsManagerClient();
        } catch(error) {
            logger.error( { error }, 'Failed to create Secrets Manager client');
            throw new Error(`Failed to create Secrets Manager client: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Reset the Secrets Manager client instance
     * Useful for testing or when configuration changes
     */
    public static resetClient(): void {
        this.secretsManagerClientInstance = null;
    }
    
    /**
     * Fetch secrets from AWS Secrets Manager
     * @param secretName The secret name to fetch
     * @param options Optional Secrets Manager options
     * @returns Result containing parsed JSON object from the secret value or error
     */
    public static async fetchSecret(secretName: string, options?: { endpoint?: string }): Promise<Result<Record<string, any>>> {
        try {
            const secretsManager = this.getSecretsManagerClient();
            const command = new GetSecretValueCommand({ SecretId: secretName });
            const response = await secretsManager.send(command);
            
            if (!response.SecretString) {
                return failure(createError({
                    name: 'SecretNotFoundError',
                    message: `Secret not found in Secrets Manager for ${secretName}`,
                    statusCode: 404,
                    type: 'NOT_FOUND'
                }));
            }
            
            return success(JSON.parse(response.SecretString));
        } catch (error) {
            // If there's a connection error, reset the client and try once more
            if (error instanceof Error && 
                (error.name === 'CredentialsProviderError' || 
                 error.name === 'TimeoutError' || 
                 error.message.includes('connect'))) {
                
                const errorInfo = getErrorInfo(error);
                logger.warn({ error: errorInfo }, 'Secrets Manager client connection issue, resetting client');
                this.resetClient();
                
                try {
                    const secretsManager = this.getSecretsManagerClient();
                    const command = new GetSecretValueCommand({ SecretId: secretName });
                    const response = await secretsManager.send(command);
                    
                    if (!response.SecretString) {
                        return failure(createError({
                            name: 'SecretNotFoundError',
                            message: `Secret not found in Secrets Manager for ${secretName}`,
                            statusCode: 404,
                            type: 'NOT_FOUND'
                        }));
                    }
                    
                    return success(JSON.parse(response.SecretString));
                } catch (retryError) {
                    return failure(createError({
                        name: 'SecretsManagerError',
                        message: `Failed to fetch secret after retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                        statusCode: 500,
                        type: 'INTERNAL_SERVER_ERROR'
                    }));
                }
            }
            
            return failure(createError({
                name: 'SecretsManagerError',
                message: `Failed to fetch secret: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                type: 'INTERNAL_SERVER_ERROR'
            }));
        }
    }
    
    /**
     * Put a secret into AWS Secrets Manager
     * Creates a new secret if it doesn't exist, otherwise updates the existing secret
     * 
     * @param secretName The name of the secret to put
     * @param secretValue The value of the secret (will be stringified if object)
     * @param overwrite Whether to overwrite an existing secret (default: false)
     * @returns Result indicating success or failure
     */
    public static async putSecret(secretName: string, secretValue: string | Record<string, any>, overwrite: boolean = false): Promise<Result<void>> {
        try {
            const secretsManager = this.getSecretsManagerClient();
            const secretString = typeof secretValue === 'string' ? secretValue : JSON.stringify(secretValue);
            
            try {
                // First check if the secret exists
                const getCommand = new GetSecretValueCommand({ SecretId: secretName });
                await secretsManager.send(getCommand);
                
                // Secret exists, update it if overwrite is true
                if (!overwrite) {
                    return failure(createError({
                        name: 'SecretExistsError',
                        message: `Secret ${secretName} already exists and overwrite is set to false`,
                        statusCode: 409,
                        type: 'CONFLICT'
                    }));
                }
                
                // Update the existing secret
                const updateCommand = new UpdateSecretCommand({
                    SecretId: secretName,
                    SecretString: secretString
                });
                await secretsManager.send(updateCommand);
                
                return success(undefined);
            } catch (checkError) {
                // If the error is not a "secret not found" error, rethrow it
                if (!(checkError instanceof Error && checkError.name === 'ResourceNotFoundException')) {
                    throw checkError;
                }
                
                // Secret doesn't exist, create it
                const createCommand = new CreateSecretCommand({
                    Name: secretName,
                    SecretString: secretString
                });
                await secretsManager.send(createCommand);
                
                return success(undefined);
            }
        } catch (error) {
            // If there's a connection error, reset the client and try once more
            if (error instanceof Error && 
                (error.name === 'CredentialsProviderError' || 
                 error.name === 'TimeoutError' || 
                 error.message.includes('connect'))) {
                
                const errorInfo = getErrorInfo(error);
                logger.warn({ error: errorInfo }, 'Secrets Manager client connection issue, resetting client');
                this.resetClient();
                
                try {
                    const secretsManager = this.getSecretsManagerClient();
                    const secretString = typeof secretValue === 'string' ? secretValue : JSON.stringify(secretValue);
                    
                    try {
                        // Check if the secret exists
                        const getCommand = new GetSecretValueCommand({ SecretId: secretName });
                        await secretsManager.send(getCommand);
                        
                        // Secret exists, update it if overwrite is true
                        if (!overwrite) {
                            return failure(createError({
                                name: 'SecretExistsError',
                                message: `Secret ${secretName} already exists and overwrite is set to false`,
                                statusCode: 409,
                                type: 'CONFLICT'
                            }));
                        }
                        
                        // Update the existing secret
                        const updateCommand = new UpdateSecretCommand({
                            SecretId: secretName,
                            SecretString: secretString
                        });
                        await secretsManager.send(updateCommand);
                        
                        return success(undefined);
                    } catch (checkError) {
                        // If the error is not a "secret not found" error, rethrow it
                        if (!(checkError instanceof Error && checkError.name === 'ResourceNotFoundException')) {
                            throw checkError;
                        }
                        
                        // Secret doesn't exist, create it
                        const createCommand = new CreateSecretCommand({
                            Name: secretName,
                            SecretString: secretString
                        });
                        await secretsManager.send(createCommand);
                        
                        return success(undefined);
                    }
                } catch (retryError) {
                    return failure(createError({
                        name: 'SecretsManagerError',
                        message: `Failed to put secret after retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                        statusCode: 500,
                        type: 'INTERNAL_SERVER_ERROR'
                    }));
                }
            }
            
            return failure(createError({
                name: 'SecretsManagerError',
                message: `Failed to put secret: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                type: 'INTERNAL_SERVER_ERROR'
            }));
        }
    }

    /**
     * Create a new secret in AWS Secrets Manager
     * @param secretName The name for the new secret
     * @param value The string value to store (JSON stringified object)
     * @param options Optional settings for the secret
     */
    public static async createSecret(
        secretName: string,
        value: string,
        options?: { description?: string }
    ): Promise<void> {
        try {
            const secretsManager = this.getSecretsManagerClient();
            const command = new CreateSecretCommand({
                Name: secretName,
                SecretString: value,
                Description: options?.description
            });
            
            await secretsManager.send(command);
            logger.info({ secretName }, 'Secret created successfully');
        } catch (error) {
            // If there's a connection error, reset the client and try once more
            if (error instanceof Error && 
                (error.name === 'CredentialsProviderError' || 
                 error.name === 'TimeoutError' || 
                 error.message.includes('connect'))) {
                
                const errorInfo = getErrorInfo(error);
                logger.warn({ error: errorInfo }, 'Secrets Manager client connection issue, resetting client');
                this.resetClient();
                
                // Try again with a fresh client
                const secretsManager = this.getSecretsManagerClient();
                const command = new CreateSecretCommand({
                    Name: secretName,
                    SecretString: value,
                    Description: options?.description
                });
                
                await secretsManager.send(command);
                logger.info({ secretName }, 'Secret created successfully after retry');
            } else {
                // Re-throw other errors
                const errorInfo = getErrorInfo(error);
                logger.error({ secretName, error: errorInfo }, 'Failed to create secret');
                throw error;
            }
        }
    }

    /**
     * Upsert a secret in AWS Secrets Manager (create if it doesn't exist, update if it does)
     * @param secretName The name for the secret
     * @param value The string value to store (JSON stringified object)
     * @param options Optional settings for the secret
     * @returns Result indicating success or failure
     */
    public static async upsertSecret(
        secretName: string,
        value: string,
        options?: { description?: string }
    ): Promise<Result<void>> {
        try {
            // First try to update the secret (assumes it exists)
            const secretsManager = this.getSecretsManagerClient();
            const updateCommand = new UpdateSecretCommand({
                SecretId: secretName,
                SecretString: value,
                Description: options?.description
            });
            
            try {
                await secretsManager.send(updateCommand);
                logger.info({ secretName }, 'Secret updated successfully');
                return success(undefined);
            } catch (updateError) {
                // If the secret doesn't exist, create it
                if (updateError instanceof Error && updateError.name === 'ResourceNotFoundException') {
                    const createCommand = new CreateSecretCommand({
                        Name: secretName,
                        SecretString: value,
                        Description: options?.description
                    });
                    
                    await secretsManager.send(createCommand);
                    logger.info({ secretName }, 'Secret created successfully');
                    return success(undefined);
                }
                
                // For other errors, return failure
                return failure(createError({
                    name: 'SecretsManagerError',
                    message: `Failed to update secret ${secretName}: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
                    statusCode: 500,
                    type: 'UPSTREAM_ERROR'
                }));
            }
        } catch (error) {
            // If there's a connection error, reset the client and try once more
            if (error instanceof Error && 
                (error.name === 'CredentialsProviderError' || 
                 error.name === 'TimeoutError' || 
                 error.message.includes('connect'))) {
                
                const errorInfo = getErrorInfo(error);
                logger.warn({ error: errorInfo }, 'Secrets Manager client connection issue, resetting client');
                this.resetClient();
                
                // Try again with a fresh client
                return this.upsertSecret(secretName, value, options);
            } else {
                // Return failure for other errors
                return failure(createError({
                    name: 'SecretsManagerError',
                    message: `Failed to upsert secret ${secretName}: ${error instanceof Error ? error.message : String(error)}`,
                    statusCode: 500,
                    type: 'UPSTREAM_ERROR'
                }));
            }
        }
    }

    /**
     * Get all secrets from AWS Secrets Manager
     * @param maxResults Maximum number of secrets to retrieve (default: 100)
     * @returns Result containing record of secret names and their values or error
     */
    public static async getAllSecrets(maxResults: number = 100): Promise<Result<Record<string, any>>> {
        try {
            const secretsManager = this.getSecretsManagerClient();
            const command = new ListSecretsCommand({ MaxResults: maxResults });
            const response = await secretsManager.send(command);
            
            if (!response.SecretList || response.SecretList.length === 0) {
                return success({});
            }
            
            const secrets: Record<string, any> = {};
            
            for (const secret of response.SecretList) {
                if (secret.Name) {
                    try {
                        const secretResult = await this.fetchSecret(secret.Name);
                        if (isFailure(secretResult)) {
                            logger.warn({ secretName: secret.Name, error: secretResult.error }, 'Failed to fetch secret');
                        } else {
                            secrets[secret.Name] = secretResult.data;
                        }
                    } catch (error) {
                        const errorInfo = getErrorInfo(error);
                        logger.warn({ secretName: secret.Name, error: errorInfo }, 'Error fetching secret');
                    }
                }
            }
            
            return success(secrets);
        } catch (error) {
            // If there's a connection error, reset the client and try once more
            if (error instanceof Error && 
                (error.name === 'CredentialsProviderError' || 
                 error.name === 'TimeoutError' || 
                 error.message.includes('connect'))) {
                
                const errorInfo = getErrorInfo(error);
                logger.warn({ error: errorInfo }, 'Secrets Manager client connection issue, resetting client');
                this.resetClient();
                
                try {
                    // Try again with a fresh client
                    return this.getAllSecrets(maxResults);
                } catch (retryError) {
                    return failure(createError({
                        name: 'SecretsManagerError',
                        message: `Failed to list secrets after retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                        statusCode: 500,
                        type: 'UPSTREAM_ERROR'
                    }));
                }
            }
            
            return failure(createError({
                name: 'SecretsManagerError',
                message: `Failed to list secrets: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                type: 'UPSTREAM_ERROR'
            }));
        }
    }
}
