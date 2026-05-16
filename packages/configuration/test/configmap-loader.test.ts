/**
 * ConfigMapLoader Integration Tests
 * 
 * Tests the ConfigMapLoader class with both config.json files and ConfigMap key files.
 * Uses temporary directories to simulate K8s ConfigMap volume mounts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigMapLoader, ConfigMapLoaderOptions, LogLevel } from '../config/configmap-loader.js';

describe('ConfigMapLoader', () => {
  let tempDir: string;
  let sharedConfigPath: string;
  let appConfigPath: string;
  let loader: ConfigMapLoader;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configmap-test-'));
    sharedConfigPath = path.join(tempDir, 'shared');
    appConfigPath = path.join(tempDir, 'app');
    
    fs.mkdirSync(sharedConfigPath, { recursive: true });
    fs.mkdirSync(appConfigPath, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (loader) {
      loader.destroy();
    }
    
    // Remove temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      loader = new ConfigMapLoader();
      
      const cacheStatus = loader.getCacheStatus();
      expect(cacheStatus.cached).toBe(false);
    });

    it('should initialize with custom options', () => {
      const options: ConfigMapLoaderOptions = {
        sharedConfigPath,
        appConfigPath,
        cacheMs: 60000,
        watchForChanges: true,
        logLevel: 'debug'
      };
      
      loader = new ConfigMapLoader(options);
      expect(loader).toBeDefined();
    });

    it('should use environment variables for paths', () => {
      const originalShared = process.env.CONFIG_PATH_SHARED;
      const originalApp = process.env.CONFIG_PATH_APP;
      
      process.env.CONFIG_PATH_SHARED = sharedConfigPath;
      process.env.CONFIG_PATH_APP = appConfigPath;
      
      loader = new ConfigMapLoader();
      expect(loader).toBeDefined();
      
      // Restore environment
      if (originalShared) process.env.CONFIG_PATH_SHARED = originalShared;
      else delete process.env.CONFIG_PATH_SHARED;
      if (originalApp) process.env.CONFIG_PATH_APP = originalApp;
      else delete process.env.CONFIG_PATH_APP;
    });
  });

  describe('Config.json File Loading', () => {
    beforeEach(() => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'silent'
      });
    });

    it('should load shared config.json file', async () => {
      const sharedConfig = {
        database: {
          host: 'localhost',
          port: 5432
        },
        api: {
          timeout: 30000
        }
      };
      
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig, null, 2)
      );
      
      const config = await loader.loadConfiguration();
      expect(config).toEqual(sharedConfig);
    });

    it('should load and merge shared + app config.json files', async () => {
      const sharedConfig = {
        database: {
          host: 'localhost',
          port: 5432
        },
        api: {
          timeout: 30000
        }
      };
      
      const appConfig = {
        database: {
          host: 'app-db-host' // Override shared
        },
        app: {
          name: 'test-app'
        }
      };
      
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig, null, 2)
      );
      
      fs.writeFileSync(
        path.join(appConfigPath, 'config.json'),
        JSON.stringify(appConfig, null, 2)
      );
      
      const config = await loader.loadConfiguration();
      
      expect(config).toEqual({
        database: {
          host: 'app-db-host', // App config overrides shared
          port: 5432
        },
        api: {
          timeout: 30000
        },
        app: {
          name: 'test-app'
        }
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        '{ invalid json'
      );
      
      await expect(loader.loadConfiguration()).rejects.toThrow(/Invalid JSON/);
    });

    it('should work with only shared config (app config optional)', async () => {
      const sharedConfig = { key: 'value' };
      
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      const config = await loader.loadConfiguration();
      expect(config).toEqual(sharedConfig);
    });
  });

  describe('ConfigMap Key File Loading', () => {
    beforeEach(() => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'silent'
      });
    });

    it('should load individual key files', async () => {
      // Create individual key files (ConfigMap volume mount pattern)
      fs.writeFileSync(path.join(sharedConfigPath, 'database.host'), 'localhost');
      fs.writeFileSync(path.join(sharedConfigPath, 'database.port'), '5432');
      fs.writeFileSync(path.join(sharedConfigPath, 'api.timeout'), '30000');
      
      const config = await loader.loadConfiguration();
      
      expect(config).toEqual({
        database: {
          host: 'localhost',
          port: '5432'
        },
        api: {
          timeout: '30000'
        }
      });
    });

    it('should merge shared and app key files', async () => {
      // Shared key files
      fs.writeFileSync(path.join(sharedConfigPath, 'database.host'), 'localhost');
      fs.writeFileSync(path.join(sharedConfigPath, 'database.port'), '5432');
      
      // App key files
      fs.writeFileSync(path.join(appConfigPath, 'database.host'), 'app-host'); // Override
      fs.writeFileSync(path.join(appConfigPath, 'app.name'), 'test-app');
      
      const config = await loader.loadConfiguration();
      
      expect(config).toEqual({
        database: {
          host: 'app-host', // App overrides shared
          port: '5432'
        },
        app: {
          name: 'test-app'
        }
      });
    });

    it('should skip hidden files and directories', async () => {
      fs.writeFileSync(path.join(sharedConfigPath, 'valid.key'), 'value');
      fs.writeFileSync(path.join(sharedConfigPath, '.hidden'), 'hidden-value');
      fs.writeFileSync(path.join(sharedConfigPath, '..parent'), 'parent-value');
      fs.mkdirSync(path.join(sharedConfigPath, 'subdir'));
      
      const config = await loader.loadConfiguration();
      
      expect(config).toEqual({
        valid: {
          key: 'value'
        }
      });
    });

    it('should handle nested dot notation keys', async () => {
      fs.writeFileSync(path.join(sharedConfigPath, 'mysql.host'), 'mysql-host');
      fs.writeFileSync(path.join(sharedConfigPath, 'mysql.database.name'), 'mydb');
      fs.writeFileSync(path.join(sharedConfigPath, 'redis.cluster.nodes'), 'node1,node2');
      
      const config = await loader.loadConfiguration();
      
      expect(config).toEqual({
        mysql: {
          host: 'mysql-host',
          database: {
            name: 'mydb'
          }
        },
        redis: {
          cluster: {
            nodes: 'node1,node2'
          }
        }
      });
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        cacheMs: 1000, // 1 second cache
        logLevel: 'silent'
      });
    });

    it('should cache configuration and return cached version', async () => {
      const sharedConfig = { key: 'original' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      // First load
      const config1 = await loader.loadConfiguration();
      expect(config1.key).toBe('original');
      
      // Change file but should get cached version
      const newConfig = { key: 'changed' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(newConfig)
      );
      
      const config2 = await loader.loadConfiguration();
      expect(config2.key).toBe('original'); // Still cached
      
      // Check cache status
      const cacheStatus = loader.getCacheStatus();
      expect(cacheStatus.cached).toBe(true);
      expect(cacheStatus.age).toBeGreaterThan(0);
      expect(cacheStatus.size).toBeGreaterThan(0);
    });

    it('should invalidate cache and reload', async () => {
      const sharedConfig = { key: 'original' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      // First load
      const config1 = await loader.loadConfiguration();
      expect(config1.key).toBe('original');
      
      // Change file
      const newConfig = { key: 'changed' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(newConfig)
      );
      
      // Invalidate cache
      loader.invalidateCache();
      
      // Should get new version
      const config2 = await loader.loadConfiguration();
      expect(config2.key).toBe('changed');
    });

    it('should expire cache after TTL', async () => {
      const shortCacheLoader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        cacheMs: 10, // 10ms cache
        logLevel: 'silent'
      });
      
      const sharedConfig = { key: 'original' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      // First load
      const config1 = await shortCacheLoader.loadConfiguration();
      expect(config1.key).toBe('original');
      
      // Change file
      const newConfig = { key: 'changed' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(newConfig)
      );
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should get new version
      const config2 = await shortCacheLoader.loadConfiguration();
      expect(config2.key).toBe('changed');
      
      shortCacheLoader.destroy();
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'silent'
      });
    });

    it('should validate existing config.json files', () => {
      const sharedConfig = { key: 'value' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      const validation = loader.validateConfigFiles();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should validate ConfigMap key files', () => {
      fs.writeFileSync(path.join(sharedConfigPath, 'key1'), 'value1');
      fs.writeFileSync(path.join(sharedConfigPath, 'key2'), 'value2');
      
      const validation = loader.validateConfigFiles();
      expect(validation.valid).toBe(true);
      expect(validation.warnings.some(w => w.includes('ConfigMap key files'))).toBe(true);
    });

    it('should detect invalid JSON in config.json', () => {
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        '{ invalid json'
      );
      
      const validation = loader.validateConfigFiles();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid JSON'))).toBe(true);
    });

    it('should handle missing shared config directory', () => {
      fs.rmSync(sharedConfigPath, { recursive: true, force: true });
      
      const validation = loader.validateConfigFiles();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('directory not found'))).toBe(true);
    });

    it('should treat missing app config as warning (optional)', () => {
      const sharedConfig = { key: 'value' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      fs.rmSync(appConfigPath, { recursive: true, force: true });
      
      const validation = loader.validateConfigFiles();
      expect(validation.valid).toBe(true); // Still valid
      expect(validation.warnings.some(w => w.includes('optional'))).toBe(true);
    });
  });


  describe('Error Handling', () => {
    beforeEach(() => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'silent'
      });
    });

    it('should throw error for missing required shared config', async () => {
      fs.rmSync(sharedConfigPath, { recursive: true, force: true });
      
      await expect(loader.loadConfiguration()).rejects.toThrow();
    });

    it('should handle missing optional app config gracefully', async () => {
      const sharedConfig = { key: 'value' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      fs.rmSync(appConfigPath, { recursive: true, force: true });
      
      const config = await loader.loadConfiguration();
      expect(config).toEqual(sharedConfig);
    });

    it('should handle file permission errors gracefully', async () => {
      const sharedConfig = { key: 'value' };
      fs.writeFileSync(
        path.join(sharedConfigPath, 'config.json'),
        JSON.stringify(sharedConfig)
      );
      
      // Make file unreadable (if not on Windows)
      if (process.platform !== 'win32') {
        fs.chmodSync(path.join(sharedConfigPath, 'config.json'), 0o000);
        
        await expect(loader.loadConfiguration()).rejects.toThrow();
        
        // Restore permissions for cleanup
        fs.chmodSync(path.join(sharedConfigPath, 'config.json'), 0o644);
      }
    });
  });

  describe('Logging Levels', () => {
    it('should respect silent log level', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'silent'
      });
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log at info level by default', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        logLevel: 'info'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      loader = new ConfigMapLoader({
        sharedConfigPath,
        appConfigPath,
        watchForChanges: true,
        logLevel: 'silent'
      });
      
      loader.destroy();
      
      const cacheStatus = loader.getCacheStatus();
      expect(cacheStatus.cached).toBe(false);
    });
  });
});
