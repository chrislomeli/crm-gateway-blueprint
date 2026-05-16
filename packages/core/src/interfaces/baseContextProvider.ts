import { execSync } from 'child_process';
import os from 'os';
import { ApplicationContext } from "./applicationContext";

/**
 * Gets git information about the current repository
 * Falls back to environment variables in container environments
 */
export function getGitInfo() {
    // For containerized environments, prioritize environment variables
    if (process.env.KUBERNETES_SERVICE_HOST || process.env.AWS_EXECUTION_ENV) {
        return {
            commitHash: process.env.GIT_COMMIT || process.env.GITHUB_SHA || 'unknown',
            shortHash: process.env.GIT_SHORT_HASH || (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 7) : 'unknown'),
            branch: process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || 'unknown',
            lastCommitTime: process.env.GIT_COMMIT_TIME || process.env.GITHUB_EVENT_TIME || 'unknown',
            dirty: false
        };
    }
    
    // For local development, try git commands
    try {
        return {
            commitHash: execSync('git rev-parse HEAD').toString().trim(),
            shortHash: execSync('git rev-parse --short HEAD').toString().trim(),
            branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
            lastCommitTime: execSync('git show -s --format=%cI').toString().trim(),
            dirty: execSync('git status --porcelain').toString().length > 0
        };
    } catch (e) {
        return {
            commitHash: 'unknown',
            shortHash: 'unknown',
            branch: 'unknown',
            lastCommitTime: 'unknown',
            dirty: false
        };
    }
}

/**
 * Gets runtime information about the current environment
 * Adapts to different runtime environments (local, kubernetes, AWS)
 */
export function getRuntimeInfo() {
    const info = {
        instanceId: '',
        hostName: '',
        pid: process.pid,
        startTime: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown',
        platform: 'unknown'
    };
    
    // Kubernetes detection
    if (process.env.KUBERNETES_SERVICE_HOST) {
        info.platform = 'kubernetes';
        info.hostName = os.hostname();
        info.instanceId = process.env.POD_NAME || os.hostname();
        return info;
    }
    
    // AWS detection
    if (process.env.AWS_EXECUTION_ENV) {
        info.platform = process.env.AWS_EXECUTION_ENV;
        info.instanceId = process.env.AWS_LAMBDA_FUNCTION_NAME || 
                          process.env.ECS_CONTAINER_METADATA_URI_V4 || 
                          os.hostname();
        info.hostName = os.hostname();
        return info;
    }
    
    // Local environment
    info.platform = 'local';
    info.hostName = os.hostname();
    info.instanceId = `${os.hostname()}-${process.pid}`;
    return info;
}

/**
 * Gets the current environment name
 * Defaults to 'local' if NODE_ENV is not set
 */
export function getEnvironment(): string {
    if (!process.env.NODE_ENV) {
        console.warn('NODE_ENV is not set, defaulting to "local"');
        return 'local';
    }
    return process.env.NODE_ENV;
}

/**
 * Creates a base application context
 * @param appIdentity Application identity information
 * @param options Additional options for context creation
 * @returns Application context object
 */
export function createBaseContext(
    appIdentity: {
        appName: string;
        namespace: string;
        integration: string;
        operation: string;
        queue?: string;
        dlq?: {type: "sqs", region: string};
    },
    options?: {
        configKeys?: {
            parameterKey?: string;
            secretsKeys?: Record<string, string>;
        }
    }
): ApplicationContext {
    const context: ApplicationContext = {
        identity: {
            appName: process.env.APP_NAME || appIdentity.appName,
            namespace: process.env.APP_NAMESPACE || appIdentity.namespace,
            integration: process.env.APP_INTEGRATION || appIdentity.integration,
            operation: process.env.APP_OPERATION || appIdentity.operation,
            version: {
                git: getGitInfo(),
                build: process.env.BUILD_ID
            },
            runtime: getRuntimeInfo()
        }
    };
    
    // Add optional queue and dlq if provided
    if (appIdentity.queue) {
        context.identity.queue = appIdentity.queue;
    }
    
    if (appIdentity.dlq) {
        context.identity.dlq = appIdentity.dlq;
    }
    
    // Add configurationKeys if provided
    if (options?.configKeys) {
        context.configurationKeys = {
            parameterKey: options.configKeys.parameterKey || process.env.PARAMETER_KEY || '',
            secretsKeys: options.configKeys.secretsKeys || {}
        };
    }
    
    return context;
}

// Singleton pattern for application context
let applicationContext: ApplicationContext | null = null;

/**
 * Gets the application context, creating it if it doesn't exist
 * @param appIdentity Application identity information
 * @param options Additional options for context creation
 * @returns Application context object
 */
export function getBaseApplicationContext(
    appIdentity: {
        appName: string;
        namespace: string;
        integration: string;
        operation: string;
        queue?: string;
        dlq?: {type: "sqs", region: string};
    },
    options?: {
        configKeys?: {
            parameterKey?: string;
            secretsKeys?: Record<string, string>;
        },
        forceRefresh?: boolean
    }
): ApplicationContext {
    if (!applicationContext || options?.forceRefresh) {
        applicationContext = createBaseContext(appIdentity, options);
    }
    return applicationContext;
}

/**
 * Gets the application context, creating it if it doesn't exist
 * This overload accepts a complete ApplicationContext for more flexibility
 * 
 * @param appContext Complete or partial ApplicationContext to enhance with runtime information
 * @param options Additional options for context creation
 * @returns Complete ApplicationContext with runtime information
 */
export function getApplicationContextFromPartial(
    appContext: Partial<ApplicationContext>,
    options?: {
        forceRefresh?: boolean
    }
): ApplicationContext {
    if (!applicationContext || options?.forceRefresh) {
        // Start with a base context using the identity from the provided context
        if (appContext.identity) {
            const baseContext = createBaseContext({
                appName: appContext.identity.appName,
                namespace: appContext.identity.namespace,
                integration: appContext.identity.integration,
                operation: appContext.identity.operation || '',
                queue: appContext.identity.queue,
                dlq: appContext.identity.dlq
            });
            
            // Preserve any configurationKeys from the provided context
            if (appContext.configurationKeys) {
                baseContext.configurationKeys = appContext.configurationKeys;
            }
            
            applicationContext = baseContext;
        } else {
            throw new Error('ApplicationContext must include identity information');
        }
    }
    
    return applicationContext;
}
