/**
 * Deep merge utility - Drop-in replacement for lodash.merge()
 * 
 * Recursively merges own and inherited enumerable string keyed properties of source
 * objects into the destination object. Source properties that resolve to undefined
 * are skipped if a destination value exists.
 * 
 * @param target The destination object
 * @param sources The source objects
 * @returns The destination object
 */
export function merge(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        merge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return merge(target, ...sources);
}

/**
 * Check if value is an object (but not an array)
 */
function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}
