
// build/build-services.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Service {
    packageName: string;
    imageName: string;
    entryPoint: string;
}

interface ServicesConfig {
    services: Service[];
}

// Load services configuration
const servicesPath = path.join(__dirname, 'services.json');
const servicesConfig: ServicesConfig = JSON.parse(
    fs.readFileSync(servicesPath, 'utf-8')
);

// Get configuration from environment and arguments
const targetService = process.argv[2];
const registry = process.env.REGISTRY || '';
const tag = process.env.TAG || 'latest';
const kindLoad = process.env.KIND_LOAD === 'true';
const kindCluster = process.env.KIND_CLUSTER || 'kind';
const push = process.env.PUSH === 'true';
const autoPrune = process.env.AUTO_PRUNE !== 'false'; // Default to true unless explicitly disabled
const pruneAfterEach = process.env.PRUNE_AFTER_EACH !== 'false'; // Default to true unless explicitly disabled

// Platform targeting for cross-architecture builds
const targetPlatform = process.env.DOCKER_PLATFORM || 'linux/amd64'; // Default to amd64 for Kubernetes compatibility
const platformFlag = targetPlatform ? `--platform ${targetPlatform}` : '';

// Determine which services to build
const servicesToBuild = targetService
    ? servicesConfig.services.filter(s => s.imageName === targetService)
    : servicesConfig.services;

if (targetService && servicesToBuild.length === 0) {
    console.error(`❌ Service '${targetService}' not found in services.json`);
    console.log('Available services:');
    servicesConfig.services.forEach(s => console.log(`  - ${s.imageName}`));
    process.exit(1);
}

// Docker cleanup functions
function checkDockerSpace(): { available: boolean; usage: string } {
    try {
        const result = execSync('docker system df --format "table {{.Type}}\\t{{.TotalCount}}\\t{{.Size}}\\t{{.Reclaimable}}"', 
            { encoding: 'utf-8' });
        console.log('📊 Docker space usage:');
        console.log(result);
        
        // Simple heuristic: if we have reclaimable space, cleanup might help
        const hasReclaimable = result.includes('GB') && result.includes('(');
        return { available: true, usage: result };
    } catch (error) {
        console.warn('⚠️  Could not check Docker space usage');
        return { available: false, usage: '' };
    }
}

function pruneDocker(aggressive = false): void {
    try {
        console.log(`🧹 ${aggressive ? 'Aggressive' : 'Safe'} Docker cleanup...`);
        
        if (aggressive) {
            // More aggressive cleanup - removes unused images, build cache, etc.
            execSync('docker system prune -f --volumes', { stdio: 'inherit' });
        } else {
            // Safe cleanup - only removes build cache and dangling images
            execSync('docker builder prune -f', { stdio: 'inherit' });
            execSync('docker image prune -f', { stdio: 'inherit' });
        }
        
        console.log('✅ Docker cleanup completed');
    } catch (error) {
        console.warn('⚠️  Docker cleanup failed, continuing with build...');
    }
}

// Initial cleanup if requested
if (autoPrune && servicesToBuild.length > 1) {
    console.log('🧹 Pre-build Docker cleanup...');
    checkDockerSpace();
    pruneDocker(false); // Safe cleanup before multi-service builds
}

// ECR login if pushing to registry
if (push && registry && registry.includes('ecr')) {
    console.log('🔐 Logging into ECR...');
    try {
        const region = registry.match(/\.ecr\.([^.]+)\./)?.[1] || 'us-west-2';
        const loginCommand = `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}`;
        execSync(loginCommand, { stdio: 'inherit' });
        console.log('✅ Successfully logged into ECR');
    } catch (error) {
        console.error('❌ ECR login failed. Make sure AWS credentials are configured.');
        process.exit(1);
    }
}

// Build each service
console.log(`🚀 Building ${servicesToBuild.length} service(s)...`);

servicesToBuild.forEach((service) => {
    const imageName = registry
        ? `${registry}/${service.imageName}`
        : service.imageName;
    const fullImageName = `${imageName}:${tag}`;

    console.log(`\n📦 Building ${fullImageName}...`);
    console.log(`   Package: ${service.packageName}`);
    console.log(`   Entry: ${service.entryPoint}`);
    console.log(`   Platform: ${targetPlatform}`);

    const buildCommand = `docker build \
    ${platformFlag} \
    --build-arg SERVICE_NAME="${service.packageName}" \
    --build-arg ENTRY_POINT="${service.entryPoint}" \
    -t ${fullImageName} \
    -f build/Dockerfile .`;

    try {
        execSync(buildCommand, { stdio: 'inherit' });
        console.log(`✅ Successfully built ${fullImageName}`);

        // If we built with a specific version tag, also tag as 'latest'
        if (tag !== 'latest' && registry) {
            const latestImageName = `${imageName}:latest`;
            console.log(`🏷️  Tagging ${fullImageName} as ${latestImageName}...`);
            execSync(`docker tag ${fullImageName} ${latestImageName}`, { stdio: 'inherit' });
            console.log(`✅ Successfully tagged as ${latestImageName}`);
        }

        // Push if requested
        if (push && registry) {
            console.log(`📤 Pushing ${fullImageName}...`);
            execSync(`docker push ${fullImageName}`, { stdio: 'inherit' });
            console.log(`✅ Successfully pushed ${fullImageName}`);
            
            // Also push the latest tag if we created it
            if (tag !== 'latest') {
                const latestImageName = `${imageName}:latest`;
                console.log(`📤 Pushing ${latestImageName}...`);
                execSync(`docker push ${latestImageName}`, { stdio: 'inherit' });
                console.log(`✅ Successfully pushed ${latestImageName}`);
            }
        }

        // Load into Kind if requested
        if (kindLoad) {
            console.log(`🔄 Loading ${fullImageName} into Kind cluster '${kindCluster}'...`);
            execSync(`kind load docker-image ${fullImageName} --name ${kindCluster}`, { stdio: 'inherit' });
            console.log(`✅ Successfully loaded into Kind cluster '${kindCluster}'`);
        }

        // Cleanup after each service if building multiple services
        if (pruneAfterEach && servicesToBuild.length > 1) {
            console.log(`🧹 Post-build cleanup for ${service.imageName}...`);
            pruneDocker(false);
        }

    } catch (error) {
        console.error(`❌ Failed to build ${service.imageName}`);
        
        // Try cleanup on failure to free space for retry
        if (autoPrune) {
            console.log('🧹 Attempting cleanup after build failure...');
            pruneDocker(true); // More aggressive cleanup on failure
        }
        
        process.exit(1);
    }
});

// Final cleanup and summary
if (autoPrune && servicesToBuild.length > 1) {
    console.log('\n🧹 Final cleanup...');
    checkDockerSpace();
}

console.log('\n✨ All builds completed successfully!');