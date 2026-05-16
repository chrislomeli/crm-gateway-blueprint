/**
 * SecretsProvider - Secret Tag Resolution
 *
 * This class provides the mechanism for resolving secret tags in configuration
 * using the modern ssm://secret/field syntax. It works with AWS Secrets Manager
 * to retrieve and inject secrets into configuration objects.
 *
 * Key features:
 * - Modern URI syntax (ssm://secret/field) for referencing secrets
 * - Recursive secret discovery in nested objects
 * - Intelligent secret caching to reduce API calls
 * - Pure function design for discovery phase
 * - Comprehensive error tracking and reporting
 * - Two-pass approach: discover then replace for better testability
 *
 * This component is a critical part of the Blueprint configuration system,
 * enabling secure handling of sensitive information without hardcoding
 * secrets in application code or configuration files.
 *
 * @module services/aws/SecretsProvider
 */
import {SecretsService} from "@platform/services";
import { logger } from '@platform/core'
import * as fs from 'fs';

export const SECRETS_PREFIX = 'ssm://';

export class SecretsProvider {
    private static secretsCache: Record<string, Record<string, any>> = {}; // this is a temporary internal structure for keeping secret values and parcelling them out to individual keys - it's not a configuration

    /**
     * Parse the secret name and key from a secrets tags
     * @param secretsTag
     */
    static parseSecretsTag(
        secretsTag: string,
    ): { found: boolean, secretName: string; secretKey: string } {
        const pattern = /^ssm:\/\/([^\/]+)\/(.+)$/;

        if (secretsTag.startsWith(SECRETS_PREFIX)) {
            const matches = secretsTag.match(pattern);
            if (matches) {
                return {
                    found: true,
                    secretName: matches[1], // Secret name (e.g., 'crm-db')
                    secretKey: matches[2], // Field name (e.g., 'password')
                };
            }
        }
        logger.error(`Secrets Cache could not parse bad token: ${secretsTag}`);
        return {found: false, secretName: '', secretKey: ''};
    }

    /**
     * utility to decide if a value is a secret tag
     * @param secretsTag
     */
    static hasASecretTag(secretsTag: any): boolean {
        const vote = (
            secretsTag &&
            typeof secretsTag === 'string' &&
            secretsTag.startsWith(SECRETS_PREFIX)
        )
        return vote;
    }

    /**
     *  Transcribe a single secret tag and handle any recursive secrets in a string
     *
     * @param secretsTag - a valid secretsTag - don't send in non-secrets
     */
    static parseSecretTags(secretsTag: string): string[] {
        if (typeof secretsTag === 'object') {
            throw new Error('Secrets does not support a nested object  ');
        }

        const tags: string[] = []

        // Check if the value contains multiple secrets
        const secretsRegex = /(ssm:\/\/[^\/]+\/[^\s]+)/g;
        const matches = secretsTag.match(secretsRegex);
        if (!matches) {
            return tags;
        }

        // Add all discovered secret tags
        for (const match of matches) {
            tags.push(match);
        }
        return tags;
    }

    /**
     * Recursively walk a nested object/array and replace secret-tagged values in place.
     * Mutates the input object. Collects all keys replaced into the provided Set.
     */
    static extractSecretTags(obj: unknown, collectedTags: string[] = []): string[] {

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (typeof obj[i] === "object" && obj[i] !== null) {
                    SecretsProvider.extractSecretTags(obj[i], collectedTags);
                } else if (SecretsProvider.hasASecretTag(obj[i])) {
                    const tags = SecretsProvider.parseSecretTags(obj[i] as string);
                    collectedTags.push(...tags);
                }
            }
        } else if (typeof obj === "object" && obj !== null) {
            const record = obj as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                if (typeof record[key] === "object" && record[key] !== null) {
                    SecretsProvider.extractSecretTags(record[key], collectedTags);
                } else if (SecretsProvider.hasASecretTag(record[key])) {
                    const tags = SecretsProvider.parseSecretTags(record[key] as string);
                    collectedTags.push(...tags);
                }
            }
        }

        return collectedTags;
    }

    /**
     * Replace all secret tags in a nested object with their actual values from cache.
     * Mutates the input object in place.
     * Handles strings with multiple secrets (e.g., "user: ssm://db/user, pass: ssm://db/pass")
     *
     * @param obj - The object to process
     * @param secretsCache - The populated secrets cache
     * @param missingReplacements - Array to collect any tags that couldn't be replaced
     */
    static replaceSecretTags(
        obj: unknown,
        secretsCache: Record<string, Record<string, any>>,
        missingReplacements: string[] = []
    ): void {
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (typeof obj[i] === "object" && obj[i] !== null) {
                    SecretsProvider.replaceSecretTags(obj[i], secretsCache, missingReplacements);
                } else if (SecretsProvider.hasASecretTag(obj[i])) {
                    obj[i] = SecretsProvider.replaceSecretValue(obj[i] as string, secretsCache, missingReplacements);
                }
            }
        } else if (typeof obj === "object" && obj !== null) {
            const record = obj as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                if (typeof record[key] === "object" && record[key] !== null) {
                    SecretsProvider.replaceSecretTags(record[key], secretsCache, missingReplacements);
                } else if (SecretsProvider.hasASecretTag(record[key])) {
                    record[key] = SecretsProvider.replaceSecretValue(record[key] as string, secretsCache, missingReplacements);
                }
            }
        }
    }

    /**
     * Replace secret tags in a string value.
     * Handles both single secrets and composite strings with multiple secrets.
     *
     * @param value - The string value that may contain secret tags
     * @param secretsCache - The populated secrets cache
     * @param missingReplacements - Array to collect any tags that couldn't be replaced
     * @returns The value with all secret tags replaced
     */
    private static replaceSecretValue(
        value: string,
        secretsCache: Record<string, Record<string, any>>,
        missingReplacements: string[]
    ): string {
        // If the entire value is a single secret tag, replace it completely
        // This allows for non-string secret values (numbers, booleans, etc.)
        const singleTag = SecretsProvider.parseSecretsTag(value);
        if (singleTag.found && value === `ssm://${singleTag.secretName}/${singleTag.secretKey}`) {
            const secretValue = secretsCache[singleTag.secretName]?.[singleTag.secretKey];
            if (secretValue !== undefined) {
                return secretValue;
            } else {
                missingReplacements.push(value);
                return value; // Keep original if not found
            }
        }

        // Otherwise, handle composite strings with potentially multiple secrets
        let result = value;
        const tags = SecretsProvider.parseSecretTags(value);

        for (const tag of tags) {
            const {found, secretName, secretKey} = SecretsProvider.parseSecretsTag(tag);
            if (found) {
                const secretValue = secretsCache[secretName]?.[secretKey];
                if (secretValue !== undefined) {
                    // Replace this specific tag in the string
                    result = result.replace(tag, String(secretValue));
                } else {
                    missingReplacements.push(tag);
                }
            }
        }

        return result;
    }

    /**
     * Load secrets from ESO-provided JSON files in the secrets directory
     * ESO creates JSON files (calls-db.yaml, opensearch.yaml, hubspot.yaml) that contain resolved secret values
     */
    static loadESOSecrets(configFolder: string): Record<string, Record<string, any>> {
        const secretsCache: Record<string, Record<string, any>> = {};
        
        // Map of expected secret files to their logical names
        const secretFileMap = {
            'calls-db.yaml': 'dev-rds-default',
            'opensearch.yaml': 'dev-aws-es', 
            'hubspot.yaml': 'shared-crm'
        };

        const secretsFolder = `${configFolder}/secrets`;
        
        try {
            if (!fs.existsSync(secretsFolder)) {
                logger.warn(`Secrets folder ${secretsFolder} does not exist - ESO secrets not available`);
                return secretsCache;
            }

            for (const [fileName, secretName] of Object.entries(secretFileMap)) {
                const filePath = `${secretsFolder}/${fileName}`;
                
                try {
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        // ESO stores the JSON as a string in the YAML file, so we need to parse it
                        const secretData = JSON.parse(content);
                        secretsCache[secretName] = secretData;
                        logger.debug(`Loaded ESO secret ${secretName} from ${fileName}`);
                    } else {
                        logger.warn(`ESO secret file ${filePath} not found`);
                    }
                } catch (error) {
                    logger.error(`Error loading ESO secret from ${filePath}: ${error}`);
                }
            }

            logger.debug(`Loaded ${Object.keys(secretsCache).length} ESO secrets`);
            return secretsCache;
            
        } catch (error) {
            logger.error(`Error loading ESO secrets from ${secretsFolder}: ${error}`);
            return secretsCache;
        }
    }

    /**
     * Recursively transcribe all secret-tagged values in a nested object, in place.
     * Returns the mutated object with all secret tags replaced by their actual values.
     *
     * ESO-Enhanced approach:
     * 1. Load secrets from ESO-provided JSON files (no AWS API calls needed)
     * 2. Replace all secret tags with cached values from ESO
     * 3. Fallback to AWS API calls only if ESO secrets are not available
     */
    static async transcribeSecrets(
        envKeys: Record<string, any>,
        configFolder: string = '/config'
    ): Promise<Record<string, any>> {
        try {
            const missingSecrets: string[] = [];
            const missingKeys: string[] = [];

            // PASS 1: Load secrets from ESO first (preferred method)
            const esoSecrets = SecretsProvider.loadESOSecrets(configFolder);
            
            // Merge ESO secrets into our cache
            Object.assign(SecretsProvider.secretsCache, esoSecrets);

            // PASS 2: Discover all secret tags in the config
            const secretTags = SecretsProvider.extractSecretTags(envKeys);

            // Dedupe tags (in case same secret appears multiple times)
            const uniqueTags = [...new Set(secretTags)];

            // Check each discovered secret and fetch from AWS if not in ESO cache
            for (const tag of uniqueTags) {
                // 1. Parse the tag
                const {found, secretName, secretKey} = SecretsProvider.parseSecretsTag(tag);
                if (!found) {
                    continue;
                }

                // 2. Check if we already have this secret in cache (from ESO or previous AWS fetch)
                let secretValues = SecretsProvider.secretsCache[secretName]
                if (!secretValues) {
                    // Fallback: if we don't have it from ESO, fetch it from AWS (legacy behavior)
                    logger.debug(`Secret ${secretName} not found in ESO cache, falling back to AWS Secrets Manager`);
                    const result = await SecretsService.fetchSecret(secretName);
                    if (result.success) {
                        secretValues = result.data;
                        // Update cache with fetched secret
                        SecretsProvider.secretsCache[secretName] = result.data;
                    }
                }

                // 3. Track missing secrets and keys
                if (!secretValues) {
                    missingSecrets.push(secretName);
                } else if (secretValues[secretKey] === undefined) {
                    missingKeys.push(`${secretName}.${secretKey}`);
                }
            }

            // Handle missing secrets before replacement
            if (missingSecrets.length > 0) {
                logger.error(`Missing secrets: ${missingSecrets.join(', ')}`);
            }
            if (missingKeys.length > 0) {
                logger.error(`Missing secret keys: ${missingKeys.join(', ')}`);
            }

            // PASS 3: Replace all secret tags with cached values
            const missingReplacements: string[] = [];
            SecretsProvider.replaceSecretTags(envKeys, SecretsProvider.secretsCache, missingReplacements);

            if (missingReplacements.length > 0) {
                logger.error(`Could not replace secret tags: ${missingReplacements.join(', ')}`);
            }

            // Return the modified object with all secrets replaced
            return envKeys;

        } catch (error) {
            logger.error({ error},'Error getting secrets (recursive): ');
            throw error;
        }
    }

    /**
     * Clear the secrets cache. Useful for testing or when secrets need to be refreshed.
     */
    static clearCache(): void {
        SecretsProvider.secretsCache = {};
    }

    /**
     * Get the current cache state. Useful for testing.
     */
    static getCache(): Record<string, Record<string, any>> {
        return { ...SecretsProvider.secretsCache };
    }
}