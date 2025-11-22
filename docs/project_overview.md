# Project Overview

## Purpose & Context

Transcriptor is a command-line tool that transforms YouTube videos into locally-stored markdown transcript files. The system addresses the need for efficient transcript extraction and management by providing a centralized caching mechanism that eliminates redundant API calls while enabling transcript sharing across multiple projects.

## Core Functionality

The system operates as a globally-accessible npm package that processes YouTube URLs to generate and manage transcript files. It maintains a dual-storage architecture where transcripts are centrally cached and symbolically linked to project directories, ensuring both persistence and accessibility.

At its core, Transcriptor reads YouTube URLs from markdown files, extracts video identifiers, fetches transcripts and associated video metadata through external APIs, and creates an organized repository of enriched transcript content. The system collects video titles and channel information alongside transcript text, enabling content organization and discoverability. These resources are intelligently managed through caching, linking, and maintenance operations.

## Architectural Overview

The architecture centers around a persistent storage layer located in the user's home directory (`~/.transcriptor`), which serves as the single source of truth for all transcript data. This centralized repository contains both the transcript content and metadata tracking system usage patterns.

The data management layer maintains a JSON-based registry that tracks comprehensive transcript metadata, including acquisition timestamps with precise date and time information, formatted video titles, and formatted channel names. This enriched metadata registry enables content discovery and organizational workflows through consistent formatting and temporal tracking.

A linking mechanism creates symbolic connections between the central repository and project-specific directories, allowing multiple projects to reference the same transcript without duplication. This approach optimizes storage while maintaining project isolation, with the linking process operating independently from the centralized metadata tracking.

## Key Design Decisions

**Centralized Storage Strategy**: The system employs a single, user-wide storage location rather than project-specific caches, maximizing transcript reuse and minimizing API consumption.

**Metadata Enrichment Architecture**: Beyond transcript text extraction, the system collects video titles and channel information through supplementary API calls, embedding this contextual metadata directly into transcript files and the central registry. The registry stores metadata in formatted versions optimized for filesystem operations and consistent presentation, while transcript content displays this formatted metadata for improved readability.

**Hybrid Filename Strategy**: Filenames combine machine-readable unique identifiers (video IDs) with human-readable sanitized titles, using the format `transcript_{videoID}_{formatted_title}.md`. Sanitization ensures filesystem compatibility while preserving content meaning, creating descriptive filenames across both centralized storage and project directories.

**Link-Based Distribution**: Symbolic links provide transcript access without file duplication, maintaining a single authoritative copy while enabling multi-project usage. The system tracks link creation for transparent access without maintaining bidirectional path registries.

**Crash-Resilient Persistence**: The system commits each transcript immediately after processing, ensuring data integrity even during unexpected terminations.

**Smart Caching Logic**: Before making API requests, the system checks for existing transcripts, significantly reducing external service dependencies and improving response times.

## Data Flow

YouTube URLs enter the system through markdown input files, where they undergo parsing to extract unique video identifiers. The system queries its cache to determine whether transcripts already exist before initiating API requests.

When new transcripts are required, the system interfaces with external services to collect both transcript text and video metadata (titles, channel names). This content undergoes formatting and enrichment before persistence. Transcript files are stored in markdown format with structured metadata headers containing formatted channel names, formatted titles, video IDs, and standardized URLs. File naming follows the pattern `transcript_{videoID}_{formatted_title}.md`, incorporating sanitized video titles for human readability while maintaining unique identifiers.

The metadata registry captures formatted video titles and channel names alongside precise timestamps (date and time), providing a searchable index of collected content with consistent formatting. Project integration occurs through symbolic link creation, connecting the central transcript store to local project directories with descriptive filenames matching the centralized naming convention.

## Integration Points

The system integrates with external transcript extraction services through API calls, specifically leveraging services capable of retrieving YouTube video transcripts. Additionally, it interfaces with YouTube's oEmbed API to obtain video metadata including titles and channel information without requiring authentication.

The filesystem serves as the primary persistence layer through standard Node.js operations for file management and symbolic link creation. The command-line interface provides the primary user interaction point, exposing functionality for transcript processing, data inspection, and maintenance operations. The system operates within the npm ecosystem as a globally-installed package accessible from any directory.

## Scope Boundaries

Transcriptor focuses exclusively on YouTube transcript extraction and management with metadata enrichment. The system handles URL parsing, transcript fetching, video metadata collection, content formatting with structured headers, storage management, and link distribution. It provides maintenance utilities for date-based data cleanup and statistics reporting.

The metadata collection enhances transcript files with formatted contextual information (channel names, titles, standardized URLs) for improved organization and discoverability, while filename formatting incorporates sanitized titles following the `transcript_{videoID}_{formatted_title}.md` convention for human-friendly navigation across storage locations.

The scope explicitly excludes video downloading, audio processing, transcript generation from raw media, complex content transformation, and publishing or sharing mechanisms beyond local filesystem operations.

**Testing Infrastructure**: Given the project's small scope and straightforward functionality, no formal testing infrastructure (unit tests, integration tests, or automated test suites) is included. The simplicity of the tool does not warrant the overhead of maintaining test frameworks.

## Business Rules

**Cache-First Processing**: The system always checks for existing transcripts before initiating API calls, treating the cache as the primary data source.

**Atomic Operations**: Each transcript processing operation completes fully before proceeding to the next, ensuring consistent state even during failures.

**Metadata Completeness**: Video titles and channel information are collected alongside transcript text, with consistent formatting applied to create self-contained, contextually-rich transcript files optimized for filesystem operations.

**Filename Normalization**: Transcript filenames follow the `transcript_{videoID}_{formatted_title}.md` pattern, combining unique video identifiers with sanitized titles to balance machine uniqueness with human readability. Title sanitization removes special characters while preserving alphanumeric content and hyphens.

**Temporal Precision**: Acquisition timestamps include both date and time information, enabling precise temporal tracking while cleanup operations focus on date-level granularity for practical data management.

**Data Persistence**: All transcript data and metadata persist indefinitely unless explicitly removed through maintenance commands.

## User Perspective

Users interact with Transcriptor through simple command-line operations. They prepare YouTube URLs in markdown files, execute the transcriptor command to process videos, and receive organized transcript files with enriched metadata in their project directories. The system transparently handles caching, deduplication, storage management, and metadata collection with consistent formatting.

Transcript files feature structured headers displaying formatted channel names, formatted video titles, unique identifiers, and standardized URLs, providing immediate context without requiring external lookups. Descriptive filenames following the `transcript_{videoID}_{formatted_title}.md` convention enable intuitive file browsing and selection within project directories.

For maintenance tasks, users can inspect system statistics to understand storage utilization and temporal distribution of transcripts. They can perform date-based cleanup operations to manage storage growth, with the system matching transcripts by date while ignoring time components for practical data lifecycle management.

The tool integrates seamlessly into existing workflows, requiring minimal configuration while providing robust transcript management capabilities with metadata-enhanced discoverability across multiple projects and use cases.
