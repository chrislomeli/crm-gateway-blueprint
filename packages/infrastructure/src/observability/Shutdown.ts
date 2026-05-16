// packages/infrastructure/src/observability/Shutdown.ts

/**
 * Observability Shutdown Utilities
 * 
 * Functions to properly flush and shutdown observability components
 * when the application is terminating.
 */

import { logger } from '@platform/core';

/**
 * Registers a function to flush logs when the process exits
 * 
 * @param flushFn Function to call for flushing logs
 */
export function flushLogsOnExit(flushFn: () => Promise<void> | void): void {
    // Register shutdown handlers for graceful termination
    const shutdownHandler = async () => {
        logger.info('Application shutdown initiated, flushing logs...');
        try {
            await Promise.resolve(flushFn());
            logger.info('Log flushing completed');
        } catch (error) {
            console.error('Error flushing logs:', error);
        }
    };

    // Register handlers for different termination signals
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('beforeExit', shutdownHandler);
}
