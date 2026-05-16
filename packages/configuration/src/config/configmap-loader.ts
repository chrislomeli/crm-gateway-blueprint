/**
 * ConfigMapLoader - Main process for loading configuration from K8s ConfigMaps
 *
 * This handles primary configuration loading from mounted ConfigMap and Secret volumes.
 * It loads configuration files, merges them, and transcribes any SSM secret tags.
 *
 * Design Philosophy:
 * - ConfigMaps and Secrets are the primary configuration sources
 * - File-based loading with caching
 * - Deep merging of shared + app + secrets configurations
 * - SSM secret tag transcription for values like ssm://secret/field
 */

// import {failureFromError, getErrorInfo, logger, Result, success} from '@platform/core';
// import {SecretsProvider} from "../secrets";
// import {loadYamlFiles} from "../utils";

//
//
//
// /**
//  * ConfigMapLoader - Primary configuration loading from K8s ConfigMaps and Secrets
//  */
// export class ConfigMapLoader {
//
//   private options: Required<ConfigMapLoaderOptions> = {
//       configFolder: '/config',
//       cacheMs: 30000,
//       timestamp: new Date(),
//   };
//
//   constructor(options: ConfigMapLoaderOptions) {
//     this.options = options;
//
//    logger.debug( this.options,`ConfigMapLoader initialized:`);
//   }
//
//
//  async loadConfiguration(): Promise<Result<ConfigObject>> {
//
//       try {
//           const now = Date.now();
//           const configFolder = this.options.configFolder;
//
//           logger.debug( 'Loading fresh configuration from ConfigMaps and secrets...');
//           const mergedConfig  = loadYamlFiles(configFolder)
//
//           // Transcribe any SSM secret tags (ssm://secret/field)
//           const transcribedConfig = await SecretsProvider.transcribeSecrets(mergedConfig);
//
//
//
//           const configKeys = Object.keys(transcribedConfig);
//           logger.debug( `Configuration loaded successfully. ${configKeys.length} top-level keys: ${configKeys.join(', ')}`);
//
//           return success(transcribedConfig);
//       } catch(error) {
//           logger.error({error: getErrorInfo(error as Error)}, "CONFIGURATION LOAD FAILED: ");
//           return failureFromError(error as Error);
//       }
//
//     }
//
//
//   /**
//    * Force refresh configuration by clearing cache and reloading
//    */
//   public async refresh(): Promise<ConfigObject> {
//    logger.debug('Force refreshing configuration...');
//
//     // Clear the cache
//
//
//     // Clear SecretsProvider cache to ensure fresh secrets
//     SecretsProvider.clearCache();
//
//     // Load fresh configuration
//     return this.loadConfiguration();
//   }
//
//   /**
//    * Invalidate cache to force reload on next get
//    */
//   public invalidateCache(): void {
//
//    logger.debug( 'Configuration cache invalidated');
//   }
//
//
//
//}