import { z } from 'zod';
import { merge } from "@platform/core";

const envs = z.enum(['dev', 'development', 'prod', 'test', 'qa', 'local']);
const colors = z.enum(['blue', 'green']);

const envSchema = z.object({
    CDK_GIT_BRANCH: z.string().min(1).describe('Git branch name (required, non-empty)'),
    NODE_ENV: envs.describe('Node environment (dev/development/prod/test/qa/local)'),
    CDK_DEPLOY_ENV: envs.describe('CDK deployment environment (dev/prod/test/qa/local)'),
    CDK_DEPLOY_COLOR: colors.describe('Deployment color (blue/green)'),
    CDK_DEPLOY_ACCOUNT: z.string().regex(/^\d{12}$/, 'Must be exactly 12 digits').describe('AWS Account ID'),
    CDK_DEPLOY_REGION: z.string().regex(/^[a-z]{2}-[a-z]+-\d+$/, 'Must match AWS region format (e.g., us-east-1)').describe('CDK deployment region'),
    AWS_REGION: z.string().regex(/^[a-z]{2}-[a-z]+-\d+$/, 'Must match AWS region format (e.g., us-west-2)').describe('AWS region'),
    
    // Health check retry configuration for R&D troubleshooting
    HEALTH_CHECK_MAX_RETRIES: z.string().regex(/^\d+$/, 'Must be a non-negative integer').default('3').describe('Max health check retries (0 = infinite retries for debugging)'),
    HEALTH_CHECK_RETRY_INTERVAL_SECONDS: z.string().regex(/^\d+$/, 'Must be a positive integer').default('30').describe('Seconds between health check retries'),
    HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED: z.string().regex(/^(true|false)$/, 'Must be true or false').default('false').describe('Enable force shutdown endpoint for R&D'),

    // Observability configuration
    OBSERVABILITY_PROVIDER: z.string().regex(/^(console|datadog|opentelemetry)$/, 'Must be console, datadog, or opentelemetry').default('console').describe('Observability provider (console/datadog/opentelemetry)'),
    OBSERVABILITY_TRACING_ENABLED: z.string().regex(/^(true|false)$/, 'Must be true or false').default('true').describe('Enable distributed tracing'),
    OBSERVABILITY_METRICS_ENABLED: z.string().regex(/^(true|false)$/, 'Must be true or false').default('true').describe('Enable metrics collection'),
});

type EnvConfig = z.infer<typeof envSchema> & Record<string, string>;

interface Config {
    env: EnvConfig;
}

interface ValidationDetails {
    field: string;
    currentValue: string | undefined;
    expectedFormat: string;
    errors: string[];
}

function getFieldDescription(field: string): string {
    const descriptions: Record<string, string> = {
        CDK_GIT_BRANCH: 'Git branch name (required, non-empty)',
        NODE_ENV: 'One of: dev, development,  prod, test, qa, local',
        CDK_DEPLOY_ENV: 'One of: dev, prod, test, qa, local',
        CDK_DEPLOY_COLOR: 'One of: blue, green',
        CDK_DEPLOY_ACCOUNT: '12-digit AWS account ID (e.g., 123456789012)',
        CDK_DEPLOY_REGION: 'AWS region format (e.g., us-east-1, eu-west-2)',
        AWS_REGION: 'AWS region format (e.g., us-west-2, ap-southeast-1)',
        HEALTH_CHECK_MAX_RETRIES: 'Non-negative integer (0 = infinite retries for debugging, default: 3)',
        HEALTH_CHECK_RETRY_INTERVAL_SECONDS: 'Positive integer seconds between retries (default: 30)',
        HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED: 'Boolean: true or false (default: false)',
        OBSERVABILITY_PROVIDER: 'Observability provider: console, datadog, or opentelemetry (default: console)',
        OBSERVABILITY_TRACING_ENABLED: 'Boolean: true or false (default: true)',
        OBSERVABILITY_METRICS_ENABLED: 'Boolean: true or false (default: true)'
    };
    return descriptions[field] || 'Unknown field';
}

function formatValidationErrors(error: z.ZodError, currentEnv: NodeJS.ProcessEnv): ValidationDetails[] {
    const details: ValidationDetails[] = [];

    // Group errors by field
    const errorsByField = new Map<string, string[]>();

    error.issues.forEach(issue => {
        const field = issue.path[0] as string;
        if (!errorsByField.has(field)) {
            errorsByField.set(field, []);
        }
        errorsByField.get(field)!.push(issue.message);
    });

    // Create detailed error info for each field
    errorsByField.forEach((errors, field) => {
        details.push({
            field,
            currentValue: currentEnv[field],
            expectedFormat: getFieldDescription(field),
            errors
        });
    });

    return details;
}

export function getEnvConfigs(): Config {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('\n========================================');
        console.error('🚨 ENVIRONMENT VALIDATION FAILED');
        console.error('========================================\n');

        // Get detailed validation info
        const validationDetails = formatValidationErrors(result.error, process.env);

        // Log summary of all environment variables
        console.error('📋 Current Environment Variables:');
        console.error('----------------------------------------');
        Object.keys(envSchema.shape).forEach(key => {
            const value = process.env[key];
            const status = validationDetails.find(d => d.field === key) ? '❌' : '✅';
            const displayValue = value === undefined ? '<undefined>' :
                value === '' ? '<empty string>' :
                    value.length > 50 ? value.substring(0, 47) + '...' : value;
            console.error(`  ${status} ${key}: ${displayValue}`);
        });

        // Log detailed errors
        console.error('\n🔍 Validation Errors:');
        console.error('----------------------------------------');
        validationDetails.forEach(detail => {
            console.error(`\n  Field: ${detail.field}`);
            console.error(`  Current Value: ${detail.currentValue === undefined ? '<undefined>' :
                detail.currentValue === '' ? '<empty string>' :
                    `"${detail.currentValue}"`}`);
            console.error(`  Expected: ${detail.expectedFormat}`);
            detail.errors.forEach(err => {
                console.error(`  Error: ${err}`);
            });
        });

        // Check for missing required variables
        const allRequiredVars = Object.keys(envSchema.shape);
        const missingVars = allRequiredVars.filter(key => !(key in process.env));

        if (missingVars.length > 0) {
            console.error('\n⚠️  Missing Environment Variables:');
            console.error('----------------------------------------');
            missingVars.forEach(key => {
                console.error(`  • ${key}: ${getFieldDescription(key)}`);
            });
        }

        // Provide helpful suggestions
        console.error('\n💡 Quick Fix Suggestions:');
        console.error('----------------------------------------');

        if (missingVars.length > 0) {
            console.error('  1. Set missing environment variables in your .env file or shell:');
            missingVars.forEach(key => {
                const example = getExampleValue(key);
                console.error(`     export ${key}="${example}"`);
            });
        }

        validationDetails.forEach(detail => {
            if (detail.currentValue && detail.errors.some(e => e.includes('Invalid'))) {
                const example = getExampleValue(detail.field);
                console.error(`  • Fix ${detail.field}: export ${detail.field}="${example}"`);
            }
        });

        console.error('\n========================================\n');

        // Create a concise error message for throwing
        const errorSummary = validationDetails
            .map(d => `${d.field} (${d.errors.join(', ')})`)
            .join('; ');

        const errorMessage = `Environment validation failed: ${errorSummary || 'Missing or invalid environment variables'}`;

        throw new Error(errorMessage);
    }

    const env = result.data;

    // Log successful validation
    console.log('✅ Environment validation successful');
    console.log(`   Deploying to: ${env.CDK_DEPLOY_ENV} (${env.CDK_DEPLOY_COLOR})`);
    console.log(`   Account: ${env.CDK_DEPLOY_ACCOUNT}`);
    console.log(`   Region: ${env.CDK_DEPLOY_REGION}`);

    const environmentVars = merge(env, {
        APP_ENDPOINT: `app-${env.CDK_DEPLOY_COLOR}.acmedev.com`,
        API_ENDPOINT: `api-${env.CDK_DEPLOY_COLOR}.acmedev.com`,
        APIG_ENDPOINT: `api2-${env.CDK_DEPLOY_COLOR}.acmedev.com`,
    });

    return { env: environmentVars };
}

// Helper function to provide example values for quick fixes
function getExampleValue(field: string): string {
    const examples: Record<string, string> = {
        CDK_GIT_BRANCH: 'main',
        NODE_ENV: 'dev',
        CDK_DEPLOY_ENV: 'dev',
        CDK_DEPLOY_COLOR: 'blue',
        CDK_DEPLOY_ACCOUNT: '123456789012',
        CDK_DEPLOY_REGION: 'us-east-1',
        AWS_REGION: 'us-east-1',
        HEALTH_CHECK_MAX_RETRIES: '0',
        HEALTH_CHECK_RETRY_INTERVAL_SECONDS: '600',
        HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED: 'true',
        OBSERVABILITY_PROVIDER: 'console',
        OBSERVABILITY_TRACING_ENABLED: 'true',
        OBSERVABILITY_METRICS_ENABLED: 'true'
    };
    return examples[field] || 'value';
}