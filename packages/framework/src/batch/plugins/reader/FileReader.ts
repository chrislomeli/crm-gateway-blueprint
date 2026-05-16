/**
 * FileReader.ts - File Reader Interface for Batch Processing
 *
 * This file defines the FileReader interface and related types for listing and reading files in batch repositories.
 * It provides a contract for implementing file readers for different storage backends (S3, filesystem, etc.).
 *
 * What does this file do?
 * - Defines FileReader and FileListElement types
 * - Standardizes how files are listed and read in batch repositories
 *
 * How do you use it?
 * - Implement the FileReader interface for your storage backend
 * - Use FileReader in batch repositories to abstract file access
 *
 * Why is this important?
 * - Enables pluggable file reading for different storage types
 * - Helps new developers understand file access in the batch framework
 *
 * @module common/framework/batch/plugins/reader/FileReader
 */
// Interface for file readers (S3, FS, etc.)
export interface FileListElement {
  path: string;
  name: string;
  size?: number;
  lastModified?: Date;
}

export interface FileReader {
  listFiles(folder: string): Promise<FileListElement[]>;
  openFile(file: FileListElement): AsyncIterable<string | Buffer>;
}
