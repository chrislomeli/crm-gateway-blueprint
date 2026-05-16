/**
 * S3 Utilities for batch processing
 */

import * as path from 'path';

/**
 * Generate S3 key with date partitioning
 */
export function generateS3Key(
    prefix: string,
    crm: string,
    fid: string,
    businessPrefix: string,
    source: string,
    fileName: string
): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return path.join(
        prefix,
        crm,
        fid,
        businessPrefix,
        source,
        `${year}/${month}/${day}`,
        fileName
    );
}

/**
 * Convert S3 URL to bucket and key components
 */
export function fromS3Url(s3Url: string): { bucket: string; key: string } {
    const url = new URL(s3Url);
    const bucket = url.hostname.split('.')[0];
    const key = url.pathname.substring(1); // Remove leading slash
    return { bucket, key };
}

/**
 * Convert bucket and key to S3 URL
 */
export function toS3URL(bucket: string, key: string): string {
    return `s3://${bucket}/${key}`;
}
