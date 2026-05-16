# Superseded Documentation

This document lists documentation files that have been superseded by newer documentation in the project. These files are kept for historical reference but should not be considered the primary source of information.

## Superseded Files

### Developer Documentation

| File Path | Superseded By | Reason |
|-----------|---------------|--------|
| `/docs/developer/getting-started.md` | `/docs/walkthrough/getting_started_toc.md` | New version provides more comprehensive onboarding information with clearer structure |
| `/docs/developer/run_demo.md` | `/docs/walkthrough/batch-processing.md` and workflow files in `.windsurf/workflows/` | Split into separate, more focused demo guides with clearer instructions |
| `/docs/developer/STANDARDS.md` | To be updated | Will be replaced with more comprehensive coding standards |

### Configuration Documentation

| File Path | Superseded By | Reason |
|-----------|---------------|--------|
| `/docs/developer/configuration.md` | `/docs/walkthrough/configuration-workshop.md` and `.windsurf/workflows/config-*.md` | New version provides hands-on workshop approach with practical exercises |
| `/docs/developer/secrets.md` | `/docs/walkthrough/configuration-workshop.md` (Secrets Management section) | Integrated into comprehensive configuration workshop |

### Batch Processing Documentation

| File Path | Superseded By | Reason |
|-----------|---------------|--------|
| `/docs/project/batch-processing.md` | `/docs/walkthrough/batch-processing.md` | Updated with clearer architecture and workflow explanations |
| `/docs/project/file-reader.md` | `/docs/walkthrough/file-reader-guide.md` | More detailed guide with practical examples |
| `/docs/project/file-processor.md` | `/docs/walkthrough/file-processor-guide.md` | Enhanced with implementation details and troubleshooting |

### Workflow Documentation

| File Path | Superseded By | Reason |
|-----------|---------------|--------|
| `/docs/workflows/README.md` | `.windsurf/workflows/*.md` | Migrated to interactive workflow files that can be executed by Cascade |
| `/docs/workflows/batch-demo.md` | `.windsurf/workflows/demo-batch-*.md` | Split into component-specific workflow files with automation |

## Current Documentation Structure

The current documentation is organized as follows:

1. **Getting Started**: `/docs/walkthrough/getting_started_toc.md` - Main entry point for all documentation
2. **Application Setup**: `/docs/walkthrough/building-an-application.md` - Guide to setting up new applications
3. **Configuration Management**:
   - `/docs/walkthrough/configuration-workshop.md` - Hands-on workshop for configuration
   - `/docs/walkthrough/configuration-strategy.md` - Overview of configuration approach
   - `.windsurf/workflows/config-*.md` - Interactive configuration workflows
4. **Batch Processing Pipeline**:
   - `/docs/walkthrough/batch-processing.md` - Overview of the batch processing system
   - `/docs/walkthrough/batch-importer-guide.md` - Guide to implementing batch importers
   - `/docs/walkthrough/file-reader-guide.md` - Guide to the file discovery service
   - `/docs/walkthrough/file-processor-guide.md` - Guide to the file processor service
   - `.windsurf/workflows/demo-batch-*.md` - Interactive batch processing workflows

## Migration Timeline

The migration to the new documentation structure is ongoing, with a focus on creating interactive workflows in the `.windsurf/workflows/` directory that complement the markdown documentation.

## Questions and Feedback

If you have questions about the documentation or feedback on the new structure, please contact the documentation team.
