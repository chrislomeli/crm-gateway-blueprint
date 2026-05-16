/**
 * Abstract Context Provider
 * 
 * This abstract class provides a template for creating application contexts
 * with common functionality while allowing specific implementations to define
 * their own identity and configuration.
 */

import { ApplicationContext } from './applicationContext';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Abstract base class for context providers
 */
export abstract class AbstractContextProvider {

    /**
     * Gets Git information about the current repository
     */
    protected getGitInfo() {
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
                commitHash: process.env.GIT_COMMIT || 'unknown',
                shortHash: process.env.GIT_SHORT_HASH || 'unknown',
                branch: process.env.GIT_BRANCH || 'unknown',
                lastCommitTime: process.env.GIT_COMMIT_TIME || 'unknown',
                dirty: false
            };
        }
    }
    
    /**
     * Gets runtime information about the current environment
     */
    protected getRuntimeInfo() {
        return {
            instanceId: `${os.hostname()}-${process.pid}`,
            hostName: os.hostname(),
            pid: process.pid,
            startTime: new Date().toISOString(),
            environment: this.getEnvironment(),
            platform: process.platform
        };
    }

    /**
     * Gets the current environment from NODE_ENV or defaults to 'local'
     */
    protected getEnvironment(): string {
        const environment = process.env.NODE_ENV;
        if (!environment) {
            console.warn('NODE_ENV is not set, defaulting to local');
            return 'local';
        }
        return environment;
    }

    /**
     * Gets the application context, creating it if it doesn't exist (singleton pattern)
     * @returns The application context
     */
    abstract getApplicationContext(): ApplicationContext;
}
