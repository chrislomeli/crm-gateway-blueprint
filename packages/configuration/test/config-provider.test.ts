/**
 * ConfigProvider Integration Tests
 * 
 * Tests the refactored ConfigProvider class with:
 * - Synchronous API with explicit string paths
 * - Secret merging and caching
 * - Fire-and-forget background refresh
 * - K8s secrets integration
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {ConfigProvider} from "@platform/configuration";


describe('ConfigProvider', () => {
  let tempDir: string;
  let sharedConfigPath: string;
  let appConfigPath: string;
  let secretsPath: string;

  beforeAll(() => {
    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Reset ConfigProvider state
    ConfigProvider.reset();

    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-provider-test-'));
    sharedConfigPath = path.join(tempDir, 'shared');
    appConfigPath = path.join(tempDir, 'app');
    secretsPath = path.join(tempDir, 'secrets');
    
    fs.mkdirSync(sharedConfigPath, { recursive: true });
    fs.mkdirSync(appConfigPath, { recursive: true });
    fs.mkdirSync(secretsPath, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with basic config', async () => {
      // Create basic config files
      const sharedConfig = {
        log: { level: 'INFO' },
        app: { name: 'test-app' }
      };
      const appConfig = {
        mysql: {
          host: 'localhost',
          port: 3306,
          database: 'test_db'
        }
      };

      fs.writeFileSync(path.join(sharedConfigPath, 'config.json'), JSON.stringify(sharedConfig, null, 2));
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(appConfig, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })

      expect(ConfigProvider.isInitialized()).toBe(true);
      expect(ConfigProvider.get('log.level')).toBe('INFO');
      expect(ConfigProvider.get('mysql.host')).toBe('localhost');
    });

    it('should throw error when accessing uninitialized provider', () => {
      expect(() => ConfigProvider.get('test.path')).toThrow('Configuration not initialized');
    });

    it('should handle missing config files gracefully', async () => {
      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })

      expect(ConfigProvider.isInitialized()).toBe(true);
      expect(ConfigProvider.get('nonexistent.key', 'default')).toBe('default');
    });
  });

  describe('Configuration Access', () => {
    beforeEach(async () => {
      const config = {
        database: {
          mysql: {
            host: 'db.example.com',
            port: 3306,
            username: 'app_user',
            database: 'production'
          }
        },
        api: {
          timeout: 5000,
          retries: 3
        },
        nested: {
          deep: {
            value: 'found'
          }
        }
      };

      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })
    });

    it('should get config values with explicit paths', () => {
      expect(ConfigProvider.get('calls-db.host')).toBe('db.example.com');
      expect(ConfigProvider.get('calls-db.port')).toBe(3306);
      expect(ConfigProvider.get('api.timeout')).toBe(5000);
      expect(ConfigProvider.get('nested.deep.value')).toBe('found');
    });

    it('should return default values for missing paths', () => {
      expect(ConfigProvider.get('nonexistent.path', 'default')).toBe('default');
      expect(ConfigProvider.get('database.mysql.nonexistent', null)).toBe(null);
    });

    it('should return undefined for missing paths without defaults', () => {
      expect(ConfigProvider.get('nonexistent.path')).toBeUndefined();
    });

    it('should get object values for parent paths', () => {
      const mysqlConfig = ConfigProvider.get('database.mysql');
      expect(mysqlConfig).toEqual({
        host: 'db.example.com',
        port: 3306,
        username: 'app_user',
        database: 'production'
      });
    });

    it('should handle empty string paths', () => {
      const allConfig = ConfigProvider.get('');
      expect(allConfig).toHaveProperty('database');
      expect(allConfig).toHaveProperty('api');
    });
  });

  describe('Secret Merging', () => {
    beforeEach(async () => {
      const config = {
        mysql: {
          host: 'db.example.com',
          port: 3306,
          username: 'app_user',
          database: 'production'
          // password will come from secrets
        },
        'crm-db': {
          host: 'crm.example.com',
          database: 'crm_prod'
          // username and password will come from secrets
        }
      };

      // Create K8s secrets
      const mysqlSecrets = {
        password: 'super_secret_password',
        ssl_cert: 'cert_content'
      };
      const crmSecrets = {
        username: 'crm_user',
        password: 'crm_password'
      };

      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));
      fs.writeFileSync(path.join(secretsPath, 'mysql'), JSON.stringify(mysqlSecrets, null, 2));
      fs.writeFileSync(path.join(secretsPath, 'crm-db'), JSON.stringify(crmSecrets, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })
    });

    it('should merge secrets into database config', () => {
      const mysqlConfig = ConfigProvider.get('mysql');
      expect(mysqlConfig).toEqual({
        host: 'db.example.com',
        port: 3306,
        username: 'app_user',
        database: 'production',
        password: 'super_secret_password',
        ssl_cert: 'cert_content'
      });
    });

    it('should merge secrets for different database domains', () => {
      const crmConfig = ConfigProvider.get('calls-db');
      expect(crmConfig).toEqual({
        host: 'crm.example.com',
        database: 'crm_prod',
        username: 'crm_user',
        password: 'crm_password'
      });
    });

    it('should not merge secrets for non-database paths', () => {
      const config = { api: { key: 'value' } };
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));
      
      // This should not have secrets merged
      const apiConfig = ConfigProvider.get('api');
      expect(apiConfig).toEqual({ key: 'value' });
    });

    it('should handle missing secrets gracefully', () => {
      const config = ConfigProvider.get('nonexistent-db');
      expect(config).toBeUndefined();
    });
  });

  describe('Raw Configuration Access', () => {
    beforeEach(async () => {
      const config = {
        mysql: {
          host: 'db.example.com',
          username: 'app_user'
        }
      };

      const secrets = { password: 'secret' };
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));
      fs.writeFileSync(path.join(secretsPath, 'mysql'), JSON.stringify(secrets, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })
    });

    it('should get raw config without secret merging', () => {
      const rawConfig = ConfigProvider.getRawConfig('mysql');
      expect(rawConfig).toEqual({
        host: 'db.example.com',
        username: 'app_user'
      });
      expect(rawConfig).not.toHaveProperty('password');
    });

    it('should get merged config with secrets', () => {
      const mergedConfig = ConfigProvider.get('mysql');
      expect(mergedConfig).toEqual({
        host: 'db.example.com',
        username: 'app_user',
        password: 'secret'
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      const config = {
        feature: {
          enabled: true,
          timeout: 1000
        },
        database: {
          mysql: { host: 'localhost' }
        }
      };

      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })
    });

    it('should check if paths exist with has()', () => {
      expect(ConfigProvider.has('feature.enabled')).toBe(true);
      expect(ConfigProvider.has('feature.timeout')).toBe(true);
      expect(ConfigProvider.has('nonexistent.path')).toBe(false);
      expect(ConfigProvider.has('database.mysql')).toBe(true);
    });

  });

  describe('Error Handling', () => {
    it('should handle malformed JSON config files', async () => {
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), '{ invalid json }');

      await expect(ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })).rejects.toThrow();
    });

    it('should handle malformed secret files gracefully', async () => {
      const config = { mysql: { host: 'localhost' } };
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));
      fs.writeFileSync(path.join(secretsPath, 'mysql'), '{ invalid json }');

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      });

      // Should still work, just without secrets
      const mysqlConfig = ConfigProvider.get('mysql');
      expect(mysqlConfig).toEqual({ host: 'localhost' });
    });

    it('should handle permission errors on secret files', async () => {
      const config = { mysql: { host: 'localhost' } };
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));
      
      // Create secret file and make it unreadable (if not on Windows)
      const secretFile = path.join(secretsPath, 'mysql');
      fs.writeFileSync(secretFile, JSON.stringify({ password: 'secret' }));
      if (process.platform !== 'win32') {
        fs.chmodSync(secretFile, 0o000);
      }

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config')
      });

      // Should still work, just without secrets
      const mysqlConfig = ConfigProvider.get('mysql');
      expect(mysqlConfig).toEqual({ host: 'localhost' });
    });
  });

  describe('Background Refresh', () => {
    beforeEach(async () => {
      const config = { mysql: { host: 'localhost' } };
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(config, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config')
      });
    });

    it('should trigger background refresh when cache is stale', async () => {
      // Get config to populate cache
      ConfigProvider.get('mysql');

      // Wait for cache to become stale
      await new Promise(resolve => setTimeout(resolve, 150));

      // Create new secret file
      fs.writeFileSync(path.join(secretsPath, 'mysql'), JSON.stringify({ password: 'new_secret' }));

      // This should trigger background refresh but return immediately
      const config = ConfigProvider.get('mysql');
      expect(config).toEqual({ host: 'localhost' }); // Should not have new secret yet

      // Wait a bit for background refresh to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now should have the new secret
      const refreshedConfig = ConfigProvider.get('mysql');
      expect(refreshedConfig).toEqual({ 
        host: 'localhost',
        password: 'new_secret'
      });
    });
  });

  describe('Integration with ConfigMaps and Secrets', () => {
    it('should load from both shared and app ConfigMaps', async () => {
      const sharedConfig = {
        global: { timeout: 30000 },
        logging: { level: 'INFO' }
      };
      const appConfig = {
        mysql: { host: 'app-db' },
        global: { retries: 3 } // Should override shared
      };

      fs.writeFileSync(path.join(sharedConfigPath, 'config.json'), JSON.stringify(sharedConfig, null, 2));
      fs.writeFileSync(path.join(appConfigPath, 'config.json'), JSON.stringify(appConfig, null, 2));

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })

      expect(ConfigProvider.get('global.timeout')).toBe(30000);
      expect(ConfigProvider.get('global.retries')).toBe(3); // App overrides shared
      expect(ConfigProvider.get('logging.level')).toBe('INFO');
      expect(ConfigProvider.get('mysql.host')).toBe('app-db');
    });

    it('should handle ConfigMap key files', async () => {
      // Create individual key files (K8s ConfigMap style)
      fs.writeFileSync(path.join(appConfigPath, 'mysql.host'), 'key-file-host');
      fs.writeFileSync(path.join(appConfigPath, 'mysql.port'), '3307');
      fs.writeFileSync(path.join(appConfigPath, 'api.timeout'), '8000');

      await ConfigProvider.initialize({
        configFolder: path.resolve(__dirname, '../../../config'),
      })

      expect(ConfigProvider.get('mysql.host')).toBe('key-file-host');
      expect(ConfigProvider.get('mysql.port')).toBe('3307');
      expect(ConfigProvider.get('api.timeout')).toBe('8000');
    });
  });
});
