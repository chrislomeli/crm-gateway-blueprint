/**
 * ConfigProvider - Static interface for unified configuration management
 *
 * This provides the easy-to-use static interface (like turbogit) while orchestrating
 * the modular components underneath. ConfigMaps are the main process, secrets are the sidecar.
 *
 * Design Philosophy:
 * - Static class for ease of use (like turbogit)
 * - ConfigMaps as main process (primary configuration)
 * - Secrets as sidecar (secondary, specialized service)
 * - Clean separation between loading and query logic
 * - Modular components underneath for testability
 */


import * as ConfigQuery from './query/config-query';
import {resolveTemplates} from "./template-provider";
import {failureFromError, Result, success, logger, getErrorInfo, noop, failure, AppErrorType} from "@platform/core";
import {loadYamlFiles} from "./utils";
import {SecretsProvider} from "./secrets";
import {getEnvConfigs} from "./config";





export interface ConfigMapLoaderOptions {
    configFolder: string;
    cacheMs: number;
    timestamp: Date;
}

interface ConfigObject {
    [key: string]: any;
}

export interface ConfigurationData {
    [key: string]: any;
}

/**
 * Static ConfigProvider - Main interface for configuration management
 *
 * ConfigMaps = Main Process (primary configuration loading and management)
 * Secrets = Sidecar (specialized secret injection service)
 */
export class ConfigProvider {
    // Configuration
    private static options: ConfigMapLoaderOptions = {
        configFolder: '/config',
        cacheMs: 600000,
        timestamp: new Date()
    }

    // Static state
    private static configData: ConfigurationData | null = null;

    /**
     * Initialize the configuration system
     * This loads ConfigMaps (main process) and sets up secrets (sidecar)
     *
     */
    public static async initialize(options?: Partial<ConfigMapLoaderOptions>): Promise<Result<ConfigurationData>> {
        // Prevent multiple simultaneous initializations
        if (ConfigProvider.configData) {
            return success(ConfigProvider.configData);
        }

        if (options) {
            ConfigProvider.options = {...ConfigProvider.options, ...options};
        }

        logger.debug({}, 'Loading ConfigMaps...');

        // Load configuration from ConfigMaps
        const configResult = await ConfigProvider.loadConfiguration();
        if (!configResult.success) {
            logger.error({error: getErrorInfo(configResult.error)}, "CONFIGURATION LOAD FAILED: ");
            return failureFromError(configResult.error as Error);
        }

        // Store config data
        ConfigProvider.set(configResult.data);

        // handle templated values - resolve templates using the loaded config data
        if (ConfigProvider.configData) {
            const resolvedConfig = ConfigProvider.resolveTemplates(ConfigProvider.configData);
            // update the configmap with resolved templates
            ConfigProvider.set(resolvedConfig as ConfigurationData);
        }

        logger.debug( 'ConfigMaps loaded successfully');
        if (ConfigProvider.configData)
            return success(ConfigProvider.configData);
        return failure({message: 'Configuration not loaded', type: AppErrorType.INTERNAL_ERROR});

    }

    static async loadConfiguration(): Promise<Result<ConfigurationData>> {

        try {
            const now = Date.now();
            const configFolder = this.options.configFolder;

            logger.debug( 'Loading fresh configuration from ConfigMaps and secrets...');
            const mergedConfigResponse  = await loadYamlFiles(configFolder);
            if (!mergedConfigResponse.success) {
                logger.error({error: getErrorInfo(mergedConfigResponse.error)}, "CONFIGURATION LOAD FAILED: ");
                return failureFromError(mergedConfigResponse.error as Error);
            }
            const yamls = mergedConfigResponse.data;

            const configs = getEnvConfigs();
            const mergedConfig = Object.assign(yamls, configs);


            // Transcribe any SSM secret tags (ssm://secret/field) - now ESO-enhanced
            const transcribedConfig = await SecretsProvider.transcribeSecrets(mergedConfig, configFolder);

            const configKeys = Object.keys(transcribedConfig);
            logger.debug( `Configuration loaded successfully. ${configKeys.length} top-level keys: ${configKeys.join(', ')}`);

            return success(transcribedConfig);

        } catch(error) {
            logger.error({error: getErrorInfo(error as Error)}, "CONFIGURATION LOAD FAILED: ");
            return failureFromError(error as Error);
        }

    }

    /**
     * Type-safe configuration getter that only accepts predefined CONFIG constants
     * This is the preferred way to access configuration - enforces compile-time type safety
     * @param configPath Must be a value from the CONFIG constants (e.g., CONFIG.CALLS_DB_HOST)
     * @param defaultValue Default value if path not found
     */
    public static get<T = any>(configPath: import('./config-keys').ValidConfigPath, defaultValue?: T): T {
        if (!ConfigProvider.configData) {
            throw new Error('Configuration not initialized. Call ConfigProvider.initialize() first.');
        }

        // Get the base value from configuration using the type-safe path
        let value = ConfigProvider.getConfigValue(configPath, defaultValue);
        return value;
    }

    /**
     * UNSAFE: Raw string configuration getter - bypasses type safety
     * Only use this for legacy code, dynamic paths, or special cases
     * Prefer using get() with CONFIG constants for type safety
     * @param path Raw configuration path string (e.g., 'mysql', 'mysql.host', or empty for all)
     * @param defaultValue Default value if path not found
     */
    public static getRaw(path: string = '', defaultValue?: any): any {
        if (!ConfigProvider.configData) {
            throw new Error('Configuration not initialized. Call ConfigProvider.initialize() first.');
        }

        // Step 1: Get the base value from configuration
        let value = ConfigProvider.getConfigValue(path, defaultValue);
        return value;
    }

    /**
     * Get raw configuration value without secret merging
     */
    public static getRawConfig(path: string, defaultValue?: any): any {
        if ( !ConfigProvider.configData) {
            throw new Error('Configuration not initialized. Call ConfigProvider.initialize() first.');
        }

        return ConfigProvider.getConfigValue(path, defaultValue);
    }

    /**
     * Check if configuration path exists
     */
    public static has(path: string): boolean {
        if ( !ConfigProvider.configData) {
            return false;
        }

        const value = ConfigProvider.getConfigValue(path, undefined);
        return value !== undefined;
    }


    /**
     * Get all configuration keys at a given path
     */
    public static getKeys(path?: string): string[] {
        if ( !ConfigProvider.configData) {
            return [];
        }

        const value = path ? ConfigProvider.getRaw(path) : ConfigProvider.configData;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value);
        }

        return [];
    }

    /**
     * Get all configuration paths (for debugging)
     */
    public static getAllPaths(): string[] {
        if ( !ConfigProvider.configData) {
            return [];
        }

        return ConfigQuery.getAllPaths(ConfigProvider.configData);
    }

    /**
     * Refresh configuration from sources
     * Reloads ConfigMaps and invalidates secret caches
     */
    public static async refresh(): Promise<void> {
        logger.debug({}, 'Refreshing configuration...');

        ConfigProvider.configData = null;

        // Reload ConfigMaps (main process)
        await ConfigProvider.initialize();

        logger.debug({}, 'Configuration refreshed');
    }

    /**
     * Check if system is initialized
     */
    public static isInitialized(): boolean {
        return ConfigProvider.configData !== null;
    }

    /**
     * Get system status for monitoring
     */
    public static getStatus(): {
        configLoaded: boolean;
    } {
        return {
            configLoaded: ConfigProvider.configData !== null,
        };
    }


    /**
     * Reset the ConfigProvider state (primarily for testing)
     */
    public static reset(): void {

        ConfigProvider.configData = null;

    }

    // Private implementation methods

    public static set(data: Record<string, string>) {
        ConfigProvider.configData = data;
    }

    /**
     * Internal method to get configuration value
     * Handles both nested objects and flat dot-notation keys
     */
    private static getConfigValue(path: string, defaultValue?: any): any {
        if (!path) {
            return ConfigProvider.configData;
        }

        const data = ConfigProvider.configData!;

        // First, try direct property access (for nested objects)
        const directValue = ConfigQuery.getByPath(data, path, undefined);
        if (directValue !== undefined) {
            return directValue;
        }

        // Second, check if we have flat dot-notation keys that match
        // This handles configs stored as { 'mysql.host': 'localhost', 'mysql.port': 3306 }
        const flatKeys = ConfigQuery.collectDotKeys(data, path);
        if (Object.keys(flatKeys).length > 0) {
            // If we found matching flat keys, return the reconstructed object
            return flatKeys;
        }

        // Third, check if the path itself exists as a key (direct match)
        if (path in data) {
            return data[path];
        }

        // Fourth, for env.* paths, fall back to environment provider defaults
        if (path.startsWith('env.')) {
            try {
                const envConfigs = getEnvConfigs();
                const envValue = ConfigQuery.getByPath(envConfigs, path, undefined);
                if (envValue !== undefined) {
                    logger.debug(`Using environment provider default for ${path}: ${envValue}`);
                    return envValue;
                }
            } catch (error) {
                logger.debug(`Failed to get environment provider default for ${path}: ${error}`);
            }
        }

        return defaultValue;
    }



    private static resolveTemplates(data: any, failedConfigs: string[] = []): any {
        // Handle strings - check for templates
        if (typeof data === 'string') {
            return data.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => {
                const trimmedPath = path.trim();
                try {
                    // For env variables, check process.env first
                    if (trimmedPath.startsWith('env.')) {
                        const envVar = trimmedPath.substring(4); // Remove 'env.' prefix
                        const envValue = ConfigProvider.getConfigValue(trimmedPath);
                        if (envValue !== undefined) {
                            return envValue;
                        }
                    }
                    
                    // Try to get from the current data being processed (but avoid infinite recursion)
                    // We pass the full payload so templates can reference other parts of the config
                    const value = ConfigQuery.getByPath(data, trimmedPath, undefined);
                    if (value !== undefined && value !== null) {
                        return String(value);
                    }
                    
                    logger.warn(`Template variable {{${trimmedPath}}} could not be resolved`);
                    failedConfigs.push(trimmedPath);
                    return `{{${trimmedPath}}}`; // Keep original template if can't resolve
                } catch (error) {
                    logger.error(`Failed to resolve template {{${trimmedPath}}}: ${error}`);
                    failedConfigs.push(trimmedPath);
                    return `{{${trimmedPath}}}`; // Keep original template if error
                }
            });
        }

        // Handle arrays
        if (Array.isArray(data)) {
            return data.map(item => ConfigProvider.resolveTemplates(item, failedConfigs));
        }

        // Handle objects
        if (data && typeof data === 'object') {
            const resolved: any = {};
            for (const [key, value] of Object.entries(data)) {
                resolved[key] = ConfigProvider.resolveTemplates(value, failedConfigs);
            }
            return resolved;
        }

        // Return primitives as-is (numbers, booleans, null, etc)
        return data;
    }

}