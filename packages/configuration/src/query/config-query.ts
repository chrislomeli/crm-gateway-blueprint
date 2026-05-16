/**
 * ConfigQuery - Pure utility functions for configuration traversal
 *
 * No state, no complexity - just simple, efficient path resolution
 */

/**
 * Get a value from an object using dot notation path
 * @param obj The object to query
 * @param path Dot notation path (e.g., 'mysql.host' or 'mysql')
 * @param defaultValue Default value if path not found
 */
export function getByPath(obj: any, path: string, defaultValue?: any): any {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  // Empty path returns the whole object
  if (!path || path.trim() === '') {
    return obj;
  }

  // Split path and traverse
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return defaultValue;
    }

    // Handle array notation if present [n]
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, propName, index] = arrayMatch;
      current = current[propName];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      } else {
        return defaultValue;
      }
    } else {
      current = current[key];
    }

    if (current === undefined) {
      return defaultValue;
    }
  }

  return current;
}

/**
 * Set a value in an object using dot notation path
 * @param obj The object to modify
 * @param path Dot notation path
 * @param value Value to set
 */
export function setByPath(obj: any, path: string, value: any): void {
  if (!obj || typeof obj !== 'object' || !path) {
    return;
  }

  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Check if a path exists in an object
 * @param obj The object to check
 * @param path Dot notation path
 */
export function hasPath(obj: any, path: string): boolean {
  return getByPath(obj, path, undefined) !== undefined;
}

/**
 * Collect all dot-notation keys from a flat object
 * This handles the case where config is stored as flat keys like:
 * { 'mysql.host': 'localhost', 'mysql.port': 3306 }
 *
 * @param obj Flat object with dot-notation keys
 * @param prefix Optional prefix to filter by
 */
export function collectDotKeys(obj: any, prefix?: string): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return {};
  }

  const result: Record<string, any> = {};
  const searchPrefix = prefix ? `${prefix}.` : '';

  for (const key in obj) {
    if (!prefix || key === prefix || key.startsWith(searchPrefix)) {
      if (key === prefix) {
        // Direct match
        result[key] = obj[key];
      } else if (key.startsWith(searchPrefix)) {
        // Nested key - we need to rebuild the structure
        const remainingPath = key.substring(searchPrefix.length);
        setByPath(result, remainingPath, obj[key]);
      }
    }
  }

  return result;
}

/**
 * Deep merge objects (for configuration merging)
 * Later arguments take precedence
 */
export function deepMerge(...objects: any[]): any {
  if (objects.length === 0) return {};
  if (objects.length === 1) return objects[0] || {};

  const result: any = {};

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;

    for (const key in obj) {
      const value = obj[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively merge objects
        result[key] = deepMerge(result[key] || {}, value);
      } else {
        // Direct assignment (arrays and primitives)
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Get all paths in an object (for debugging/inspection)
 */
export function getAllPaths(obj: any, currentPath = '', paths: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') {
    return paths;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const path = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
      paths.push(path);
      if (typeof item === 'object' && item !== null) {
        getAllPaths(item, path, paths);
      }
    });
  } else {
    Object.keys(obj).forEach(key => {
      const path = currentPath ? `${currentPath}.${key}` : key;
      paths.push(path);
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        getAllPaths(obj[key], path, paths);
      }
    });
  }

  return paths;
}

/**
 * Flatten a nested object to dot-notation keys
 * { mysql: { host: 'localhost' } } => { 'mysql.host': 'localhost' }
 */
export function flattenObject(obj: any, prefix = '', result: Record<string, any> = {}): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    if (prefix) {
      result[prefix] = obj;
    }
    return result;
  }

  if (Array.isArray(obj)) {
    if (prefix) {
      result[prefix] = obj; // Store arrays as-is
    }
    return result;
  }

  Object.keys(obj).forEach(key => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, newKey, result);
    } else {
      result[newKey] = value;
    }
  });

  return result;
}

/**
 * Unflatten dot-notation keys to nested object
 * { 'mysql.host': 'localhost' } => { mysql: { host: 'localhost' } }
 */
export function unflattenObject(obj: Record<string, any>): any {
  const result: any = {};

  for (const key in obj) {
    setByPath(result, key, obj[key]);
  }

  return result;
}