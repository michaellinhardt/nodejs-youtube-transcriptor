# Project Overview

## Summary

`transcriptor` is a command-line interface (CLI) tool designed to fetch transcripts of YouTube videos and store them locally as Markdown files. It is intended to be installed globally as an npm package, used via `npm link` for local development and usage without publishing to the public npm registry.

The tool reads a list of YouTube URLs from a `youtube.md` file, retrieves their transcripts using the Scrape Creators API, and organizes them in a centralized directory in the user's home folder (`~/.transcriptor`). This centralized system allows for efficient caching, preventing redundant API calls for previously fetched transcripts.

## Core Workflow

1. **Initiation**: The user runs the `transcriptor` command in their terminal.
2. **Input File**: The tool looks for a `youtube.md` file in the current directory. If the file is not found, it displays a help message.
3. **URL Processing**: It reads the `youtube.md` file, taking one YouTube URL per line. For each URL, it extracts the video ID.
4. **Transcript Fetching**:
    * The tool checks if a transcript for a given video ID already exists in the central cache (`~/.transcriptor/data.json`).
    * If it exists, the tool skips the API call.
    * If not, it calls the `Scrape Creators` API (using a key from an environment variable) to retrieve the transcript text from the `transcript_only_text` property.
5. **File Storage**:
    * The fetched transcript is saved as a new Markdown file (`{youtube_id}.md`) inside the centralized `~/.transcriptor/transcripts/` directory.
    * An entry for the new transcript is added to the `~/.transcriptor/data.json` file.
6. **Local Linking**: A symbolic link to the newly created or existing transcript file is created in a `transcripts/` folder within the user's current working directory.

## Features

### Centralized Transcript Storage

All transcripts are stored in a `.transcriptor` directory located in the user's home folder (`~/`). This directory contains:

* `data.json`: A JSON file that acts as a database, tracking metadata for each transcript.
* `transcripts/`: A folder containing all the fetched transcript Markdown files.

The `data.json` file has the following structure:

```json
{
  "[transcript-id]": {
    "date_added": "YYYY-MM-DD",
    "links": ["/path/to/link1", "/path/to/link2"]
  }
}
```

### Caching Mechanism

The tool avoids re-fetching transcripts by checking if a video ID is already present in `data.json`. If a transcript has been previously downloaded, the tool simply creates a new symbolic link to the existing file, saving API usage and time.

### Maintenance and Management

The tool provides several commands for managing the transcript store:

* `transcriptor data`: Displays summary statistics about the `.transcriptor` directory, including the total number of transcripts, total folder size, and the dates of the oldest and newest transcripts.
* `transcriptor clean YYYY-MM-DD`: Removes all transcript entries (including the `.md` file and all associated symbolic links) that were added before the specified date.

### Automated Maintenance

On every execution, the tool performs a self-check to ensure data integrity. It verifies that every entry in `data.json` has a corresponding transcript file in the `transcripts/` folder. If a file is missing, the tool automatically cleans up the stale entry from `data.json` and removes any broken symbolic links.

### Robust File Operations

To ensure data consistency, especially during interruptions, the `data.json` file is completely rewritten after every single operation that modifies its content (e.g., adding a new transcript, cleaning an old one). This atomic approach prevents data corruption.
