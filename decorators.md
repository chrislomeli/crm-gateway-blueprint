# Directory Package: decorators
# Total files: 3
################################################################################

### FILE: index.ts
```
/**
 * Resilience Decorators
 * 
 * TypeScript decorators for adding resilience patterns to class methods.
 */

export { Resilient, type PresetType } from './resilient.decorator';
```

### FILE: resilient.decorator.ts
```
/**
 * Resilient Decorator - TypeScript decorator for adding resilience patterns to methods
 * 
 * This decorator wraps class methods with the existing Observable infrastructure,
 * using preset configurations for common resilience patterns.
 * 
 * @module resilience/decorators/resilient
 */

import { ApplicationContext, Result } from '@platform/core';
import { createObservableFunction, ObservableFunctionConfig } from '../templates/ObservableFunction';
import { 
    DATABASE_PRESET, 
    EXTERNAL_API_PRESET, 
    INTERNAL_SERVICE_PRESET, 
    CRITICAL_OPERATION_PRESET 
} from '../preset-configs';

/**
 * Preset configuration types supported by the decorator
 */
export type PresetType = 'database' | 'external-api' | 'internal-service' | 'critical-operation';

/**
 * Map preset names to their configurations
 */
const PRESET_MAP: Record<PresetType, Partial<ObservableFunctionConfig>> = {
    'database': DATABASE_PRESET,
    'external-api': EXTERNAL_API_PRESET,
    'internal-service': INTERNAL_SERVICE_PRESET,
    'critical-operation': CRITICAL_OPERATION_PRESET
};

/**
 * Resilient decorator that wraps methods with Observable infrastructure
 * 
 * @param presetType The preset configuration to use
 * @returns Method decorator
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @Resilient('database')
 *   async getUserById(id: string): Promise<Result<User>> {
 *     // business logic - must return Result<T>
 *     const user = await this.userRepository.findById(id);
 *     return success(user);
 *   }
 * 
 *   @Resilient('external-api')
 *   async callExternalService(): Promise<Result<ApiResponse>> {
 *     // external API call logic
 *     const response = await this.httpClient.get('/api/data');
 *     return success(response.data);
 *   }
 * }
 * ```
 */
export function Resilient(presetType: PresetType) {
    return function (
        targetOrMethod: any,
        propertyKeyOrContext?: string | any,
        descriptor?: PropertyDescriptor
    ) {
        // Detect if this is the new TC39 decorator standard (method, context)
        if (typeof targetOrMethod === 'function' && propertyKeyOrContext && typeof propertyKeyOrContext === 'object' && 'kind' in propertyKeyOrContext) {
            // TC39 Stage 3 decorator: (method, context)
            const originalMethod = targetOrMethod;
            const context = propertyKeyOrContext;
            
            if (context.kind !== 'method') {
                throw new Error(`@Resilient decorator can only be applied to methods`);
            }

            return function (this: any, ...args: any[]): Promise<Result<any>> {
                // Get ApplicationContext from the class instance
                let appContext: ApplicationContext;
                
                if (typeof (this as any).getContext === 'function') {
                    appContext = (this as any).getContext();
                } else if ((this as any).context) {
                    appContext = (this as any).context;
                } else {
                    throw new Error(
                        `@Resilient decorator requires the class to have either a 'context' property or 'getContext()' method. ` +
                        `Please add one of these to provide ApplicationContext.`
                    );
                }

                // Get the preset configuration
                const presetConfig = PRESET_MAP[presetType];
                if (!presetConfig) {
                    throw new Error(`Unknown preset type: ${presetType}`);
                }

                // Create operation name from class and method names
                const className = (this as any).constructor.name;
                const operationName = `${className}.${String(context.name)}`;

                // Create the observable function configuration
                const config: ObservableFunctionConfig = {
                    context: appContext,
                    operationName,
                    ...presetConfig
                };

                // Create worker function that calls the original method
                const workerFn = async (): Promise<Result<any>> => {
                    return originalMethod.apply(this, args);
                };

                // Create and execute the observable function
                const observableFunction = createObservableFunction(config, workerFn);
                return observableFunction();
            };
        }
        
        // Legacy experimental decorator: (target, propertyKey, descriptor?)
        const target = targetOrMethod;
        const propertyKey = propertyKeyOrContext as string;
        
        // Handle both legacy and modern descriptor scenarios
        if (!descriptor) {
            // For legacy decorators, we need to get the descriptor ourselves
            descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
            if (!descriptor) {
                // If still no descriptor, create a basic one
                descriptor = {
                    value: target[propertyKey],
                    writable: true,
                    enumerable: false,
                    configurable: true
                };
            }
        }
        
        const originalMethod = descriptor.value;
        
        if (!originalMethod || typeof originalMethod !== 'function') {
            throw new Error(`@Resilient decorator can only be applied to methods. Got ${typeof originalMethod} for property ${String(propertyKey)}`);
        }

        descriptor.value = function (...args: any[]): Promise<Result<any>> {
            // Get ApplicationContext from the class instance
            let context: ApplicationContext;
            
            if (typeof (this as any).getContext === 'function') {
                context = (this as any).getContext();
            } else if ((this as any).context) {
                context = (this as any).context;
            } else {
                throw new Error(
                    `@Resilient decorator requires the class to have either a 'context' property or 'getContext()' method. ` +
                    `Please add one of these to provide ApplicationContext.`
                );
            }

            // Get the preset configuration
            const presetConfig = PRESET_MAP[presetType];
            if (!presetConfig) {
                throw new Error(`Unknown preset type: ${presetType}`);
            }

            // Create operation name from class and method names
            const className = this.constructor.name;
            const operationName = `${className}.${propertyKey}`;

            // Create the observable function configuration
            const config: ObservableFunctionConfig = {
                context,
                operationName,
                ...presetConfig
            };

            // Create worker function that calls the original method
            const workerFn = async (): Promise<Result<any>> => {
                return originalMethod.apply(this, args);
            };

            // Create and execute the observable function
            const observableFunction = createObservableFunction(config, workerFn);
            return observableFunction();
        };

        // For legacy decorators that don't pass descriptor, set it on the target
        if (arguments.length === 2) {
            Object.defineProperty(target, propertyKey, descriptor);
        }

        return descriptor;
    };
}
```

### FILE: simple-example.ts
```
/**
 * Simple working example of the Resilient decorator
 * 
 * This demonstrates the basic usage pattern without complex typing issues.
 */

import { ApplicationContext, Result, success, failure, createError } from '@platform/core';
import { Resilient } from './resilient.decorator';

/**
 * Simple service class demonstrating the Resilient decorator usage
 */
export class SimpleService {
    constructor(private context: ApplicationContext) {}

    /**
     * Required method for the decorator to get ApplicationContext
     */
    getContext(): ApplicationContext {
        return this.context;
    }

    /**
     * Database operation example - uses DATABASE_PRESET
     */
    @Resilient('database')
    async getUser(id: string): Promise<Result<any>> {
        if (id === 'invalid') {
            return failure(createError({
                type: 'NotFound',
                message: 'User not found',
                statusCode: 404
            }));
        }
        
        return success({ id, name: `User ${id}` });
    }

    /**
     * External API operation example - uses EXTERNAL_API_PRESET
     */
    @Resilient('external-api')
    async callApi(endpoint: string): Promise<Result<any>> {
        if (endpoint.includes('fail')) {
            return failure(createError({
                type: 'ExternalServiceError',
                message: 'External service unavailable',
                statusCode: 503
            }));
        }
        
        return success({ data: `Response from ${endpoint}` });
    }
}
```

