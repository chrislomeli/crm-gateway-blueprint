/**
 * Runtime context interfaces
 * 
 * These interfaces define the structure of runtime context information
 * used throughout the application.
 */

/**
 * Git information about the current repository
 */
export interface GitInfo {
    commitHash: string;
    shortHash: string;
    branch: string;
    lastCommitTime: string;
    dirty: boolean;
}

/**
 * Runtime information about the current environment
 */
export interface RuntimeInfo {
    instanceId: string;
    hostName: string;
    pid: number;
    startTime: string;
    environment: string;
    platform: string;
}

/**
 * Options for context creation
 */
export interface ContextOptions {
    configKeys?: {
        parameterKey?: string;
        secretsKeys?: Record<string, string>;
    };
    forceRefresh?: boolean;
}

/**
 * Application identity information
 */
export interface AppIdentity {
    appName: string;
    namespace: string;
    integration: string;
    operation: string;
    queue: 'KAFKA';
    dlq: {type: "sqs", region: string};
}
