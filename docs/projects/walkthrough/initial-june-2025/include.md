# Documentation to Retain

This document lists existing documentation files that should be retained alongside the new documentation structure in `docs/newdocs/`. These files contain valuable information that complements the new documentation.

## Files to Retain

### Developer Documentation

| File Path | Reason to Keep | Relationship to New Docs |
|-----------|----------------|--------------------------|
| `/docs/developer/PROJECT_STRUCTURE.md` | Provides detailed explanation of the monorepo structure that remains accurate | Complements `/docs/newdocs/architecture/overview.md` with more detailed project structure information |
| `/docs/developer/CONTRIBUTING.md` | Contains up-to-date contribution guidelines | Referenced by `/docs/newdocs/getting-started.md` for contribution workflows |
| `/docs/developer/API.md` | Contains detailed API documentation that remains accurate | Complements the architecture documentation with API-specific details |
| `/docs/developer/TROUBLESHOOTING.md` | Contains valuable troubleshooting tips from past issues | Complements the QA guide with additional troubleshooting information |

### Technical Documentation

| File Path | Reason to Keep | Relationship to New Docs |
|-----------|----------------|--------------------------|
| `/docs/technical/KAFKA_SETUP.md` | Contains detailed Kafka configuration that remains relevant | Provides deeper technical details referenced by architecture docs |
| `/docs/technical/ELASTICSEARCH_SCHEMA.md` | Contains current Elasticsearch schema definitions | Provides schema details referenced by architecture docs |
| `/docs/technical/OBSERVABILITY.md` | Contains detailed observability setup information | Complements the architecture and QA documentation |

### Reference Documentation

| File Path | Reason to Keep | Relationship to New Docs |
|-----------|----------------|--------------------------|
| `/docs/reference/ERROR_CODES.md` | Contains comprehensive error code reference | Provides detailed error information referenced by QA guide |
| `/docs/reference/CONFIGURATION.md` | Contains detailed configuration options | Provides configuration details referenced by architecture docs |
| `/docs/reference/GLOSSARY.md` | Contains domain-specific terminology | Provides terminology referenced throughout the documentation |

## Integration with New Documentation

The retained documentation is referenced from the new documentation structure where appropriate. Cross-references have been added to ensure users can navigate between related documents.

## Maintenance Strategy

These retained documents will be:

1. Regularly reviewed for accuracy
2. Updated as needed to maintain consistency with the new documentation
3. Eventually migrated to the new structure when appropriate

## Documentation Gaps

The following areas have been identified as gaps in the current documentation that need to be addressed:

1. Detailed API documentation for the new dual-connector architecture
2. Comprehensive testing strategy for the batch processing components
3. Error handling and recovery procedures for both flows

These gaps will be addressed in future documentation updates.

## Questions and Feedback

If you have questions about which documentation to reference or feedback on the documentation structure, please contact the documentation team.
