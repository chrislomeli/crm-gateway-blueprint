#!/usr/bin/env tsx
/**
 * Configuration Health Check Script
 * 
 * Usage:
 *   tsx packages/configuration/scripts/health-check.ts
 *   
 * Or from package root:
 *   pnpm run config:health-check
 */

import { runConfigHealthCheck } from '../src/config-health-check.js';

// Run the health check
runConfigHealthCheck().catch(console.error);
