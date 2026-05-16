/**
 * Bootstrap all configurations for a specific environment
 *
 * This script bootstraps:
 * - Shared configurations from config/{environment}/shared/*.yaml
 * - Application configurations from config/{environment}/publishing/*.yaml
 * - Secrets from config/{environment}/local_secrets.yaml
 *
 * Usage:
 *   npm run bootstrap-all <environment> [--docker] [--dump-config]
 *
 * Where environment is required (local, dev, test, qa, prod)
 *
 * Options:
 *   --docker, -d    Specify that the script is running in a Docker container
 *                   This affects the LocalStack endpoint (localstack vs localhost)
 *   --dump-config   Dump configuration to JSON file
 *
 * Required Environment Variables:
 *   NODE_ENV                       Environment name (should match command line argument)
 *   AWS_REGION                     AWS region to use
 *   AWS_ACCESS_KEY_ID              AWS access key ID
 *   AWS_SECRET_ACCESS_KEY          AWS secret access key
 *   AWS_ENDPOINT_URL               AWS endpoint URL (localstack:4566 in Docker, localhost:4566 locally)
 *   AWS_SSM_ENDPOINT               AWS SSM endpoint URL (same as AWS_ENDPOINT_URL)
 *   AWS_SECRETS_MANAGER_ENDPOINT   AWS Secrets Manager endpoint URL (same as AWS_ENDPOINT_URL)
 */
import * as fs from 'fs';
import * as path from 'path';
import {failure, success, logger, getErrorInfo} from '@platform/core';
import * as yaml from 'js-yaml';
import { glob } from 'glob';


/**
 * Pure functions for YAML configuration loading
 */

/**
 * Load all YAML files from a directory and its subdirectories recursively
 * @param folder Directory path containing YAML files
 * @returns Success result with loaded configurations or failure result with error
 */
export async function loadYamlFiles(folder: string) {
    try {
        logger.debug(`Recursively gathering YAML files from ${folder}`);

        // Initialize with empty configurations
        const rawAppConfigs: Record<string, Record<string, any>> = {};

        if (!fs.existsSync(folder)) {
            logger.warn(`Folder ${folder} does not exist`);
            return success(rawAppConfigs);
        }

        // Use glob to find all YAML files recursively
        const pattern = path.join(folder, '**/*.{yaml,yml}').replace(/\\/g, '/');
        const yamlFiles = await glob(pattern);

        logger.debug(`Found ${yamlFiles.length} YAML files: ${yamlFiles.join(', ')}`);

        for (const filePath of yamlFiles) {
            // Get relative path from the root folder
            const relativePath = path.relative(folder, filePath);
            const dirName = path.dirname(relativePath);
            const fileName = path.basename(filePath, path.extname(filePath));
            
            // Create a nested key structure: folder/filename
            const configKey = dirName === '.' ? fileName : `${dirName}/${fileName}`;
            
            logger.debug(`Loading YAML file: ${filePath} as key: ${configKey}`);
            const yamlContent = readYamlFile(filePath);
            
            if (yamlContent) {
                if (rawAppConfigs[fileName]) {
                    // Merge with existing configuration using Object.assign
                    rawAppConfigs[fileName] = Object.assign(rawAppConfigs[fileName], yamlContent);
                    logger.debug(`Merged configuration for ${fileName}`);
                } else {
                    // First time seeing this filename
                    rawAppConfigs[fileName] = yamlContent;
                }
            }
        }

        logger.debug(`Done loading ${Object.keys(rawAppConfigs).length} configuration files`);
        return success(rawAppConfigs);

    } catch (error) {
        return failure({
            message: `Error gathering recursive configuration: ${error instanceof Error ? error.message : String(error)}`,
            name: 'ConfigLoadError',
            type: 'ConfigError'
        });
    }
}


/**
 * Read and parse a single YAML file
 * @param filePath Path to the YAML file
 * @returns Parsed YAML data or null if error
 */
export function readYamlFile(filePath: string) {
    try {
       logger.debug(`Loading YAML file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        return data;
    } catch (error) {
        logger.error(getErrorInfo(error), `Error loading YAML file ${filePath}`);
        return null;
    }
}


