/**
 * Application context interfaces
 * 
 * These interfaces define the structure of the application context used for configuration
 * and identity throughout the application.
 */

/**
 * Application identity information
 */
export interface Identity {
    appName: string;
    namespace: string;
    integration: string;
    operation?: string;
    serverMode?: boolean;
    version?: Record<string, any>;
    runtime?: Record<string, any>;
    queue?:  string;
    dlq?: {type: "sqs", region: string};
}

/**
 * Application configuration keys
 */
export interface ConfigurationKeys {
    parameterKey: string;
    secretsKeys?: Record<string, string>;
}

/**
 * Application context containing identity and configuration
 */
export interface ApplicationContext {
    identity: Identity;
    configurationKeys?: ConfigurationKeys;
    requiredConfigs?: string[];
    appConfigDir?: string;
    globalConfigs?: Record<string, any>;
    tenantId?: string;
}
