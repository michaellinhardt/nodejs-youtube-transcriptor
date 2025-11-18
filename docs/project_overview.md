# Project Overview

## Purpose & Context

Transcriptor is a command-line tool that transforms YouTube videos into locally-stored markdown transcript files. The system addresses the need for efficient transcript extraction and management by providing a centralized caching mechanism that eliminates redundant API calls while enabling transcript sharing across multiple projects.

## Core Functionality

The system operates as a globally-accessible npm package that processes YouTube URLs to generate and manage transcript files. It maintains a dual-storage architecture where transcripts are centrally cached and symbolically linked to project directories, ensuring both persistence and accessibility.

At its core, Transcriptor reads YouTube URLs from markdown files, extracts video identifiers, fetches transcripts through external APIs, and creates an organized repository of transcript content. The system intelligently manages these resources through caching, linking, and maintenance operations.

## Architectural Overview

The architecture centers around a persistent storage layer located in the user's home directory (`~/.transcriptor`), which serves as the single source of truth for all transcript data. This centralized repository contains both the transcript content and metadata tracking system usage patterns.

The data management layer maintains a JSON-based registry that tracks transcript metadata, including acquisition timestamps and link locations across the filesystem. This registry enables the system to understand transcript usage patterns and manage lifecycle operations effectively.

A linking mechanism creates symbolic connections between the central repository and project-specific directories, allowing multiple projects to reference the same transcript without duplication. This approach optimizes storage while maintaining project isolation.

## Key Design Decisions

**Centralized Storage Strategy**: The system employs a single, user-wide storage location rather than project-specific caches, maximizing transcript reuse and minimizing API consumption.

**Link-Based Distribution**: Symbolic links provide transcript access without file duplication, maintaining a single authoritative copy while enabling multi-project usage.

**Crash-Resilient Persistence**: The system commits each transcript immediately after processing, ensuring data integrity even during unexpected terminations.

**Smart Caching Logic**: Before making API requests, the system checks for existing transcripts, significantly reducing external service dependencies and improving response times.

## Data Flow

YouTube URLs enter the system through markdown input files, where they undergo parsing to extract unique video identifiers. The system queries its cache to determine whether transcripts already exist before initiating API requests.

When new transcripts are required, the system interfaces with external transcript services, processes the returned content, and persists both the transcript text and associated metadata. The transcript files are stored in markdown format within the central repository.

Project integration occurs through symbolic link creation, connecting the central transcript store to local project directories. The metadata registry tracks these connections, enabling comprehensive lifecycle management.

## Integration Points

The system integrates with external transcript extraction services through API calls, specifically leveraging services capable of retrieving YouTube video transcripts. It interfaces with the filesystem through standard Node.js operations for file management and symbolic link creation.

The command-line interface provides the primary user interaction point, exposing functionality for transcript processing, data inspection, and maintenance operations. The system operates within the npm ecosystem as a globally-installed package accessible from any directory.

## Scope Boundaries

Transcriptor focuses exclusively on YouTube transcript extraction and management. The system handles URL parsing, transcript fetching, storage management, and link distribution. It provides maintenance utilities for data cleanup and statistics reporting.

The scope explicitly excludes video downloading, audio processing, transcript generation from raw media, content transformation beyond basic text extraction, and publishing or sharing mechanisms beyond local filesystem operations.

## Business Rules

**Cache-First Processing**: The system always checks for existing transcripts before initiating API calls, treating the cache as the primary data source.

**Atomic Operations**: Each transcript processing operation completes fully before proceeding to the next, ensuring consistent state even during failures.

**Link Integrity**: The system maintains bidirectional tracking between transcripts and their symbolic links, enabling proper cleanup and orphan detection.

**Data Persistence**: All transcript data and metadata persist indefinitely unless explicitly removed through maintenance commands.

## User Perspective

Users interact with Transcriptor through simple command-line operations. They prepare YouTube URLs in markdown files, execute the transcriptor command to process videos, and receive organized transcript files in their project directories. The system transparently handles caching, deduplication, and storage management.

For maintenance tasks, users can inspect system statistics to understand storage utilization and transcript distribution. They can perform cleanup operations based on date ranges to manage storage growth while preserving recent or actively-used content.

The tool integrates seamlessly into existing workflows, requiring minimal configuration while providing robust transcript management capabilities across multiple projects and use cases.