import {ConfigProvider} from "./config-provider";
import { logger } from '@platform/core';

export function resolveTemplates(data: any): any {
    // Handle strings - check for templates
    if (typeof data === 'string') {
        return data.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => {
            const trimmedPath = path.trim();
            try {
                const value = ConfigProvider.get(trimmedPath);
                if (value === undefined || value === null) {
                    logger.warn({ templatePath: trimmedPath, resolvedValue: value }, 'Template variable resolved to null/undefined');
                    return '';
                }
                return String(value);
            } catch (error) {
                throw new Error(`Failed to resolve template {{${trimmedPath}}}: ${error}`);
            }
        });
    }

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => resolveTemplates(item));
    }

    // Handle objects
    if (data && typeof data === 'object') {
        const resolved: any = {};
        for (const [key, value] of Object.entries(data)) {
            resolved[key] = resolveTemplates(value);
        }
        return resolved;
    }

    // Return primitives as-is (numbers, booleans, null, etc)
    return data;
}

