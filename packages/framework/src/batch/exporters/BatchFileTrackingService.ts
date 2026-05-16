/**
 * Temporary stub for BatchFileTrackingService
 * This will be replaced with proper implementation once we consolidate the services
 */

export enum BatchFileStatus {
    DOWNLOADED = 'downloaded',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    DOWNLOAD_FAILED = 'download_failed',
    SYSTEM_UNAVAILABLE = 'system_unavailable'
}

export interface BatchFileRecord {
    businessId: string;
    filePath: string;
    fileName: string;
    fileTimestamp: string;
    status: BatchFileStatus;
}

export interface TenantInfo {
    businessId: string;
    tenantId: string;
    name?: string;
}

export class BatchFileTrackingService {
    async registerFile(record: BatchFileRecord, filePathHash: string): Promise<void> {
        // Stub implementation - will be replaced with real database integration
        console.log('BatchFileTrackingService.registerFile:', { record, filePathHash });
    }

    async updateFileStatus(fileId: number, status: BatchFileStatus): Promise<void> {
        // Stub implementation
        console.log('BatchFileTrackingService.updateFileStatus:', { fileId, status });
    }
}
