# Request

We are going to add a feature to collect the youtube video title each time we collect a transcript. It will lead to few changes to integrate this new data.

## Feature changes

 When collecting a transcript, the script will also collect the video title by using the prototyped method in the file ./youtube_title_apifree.js

You will add an utils function that convert the youtube title into lowercase, replace space by an `_` and remove all character which are not num or alphabetic. Except for dash `-`.

You will add a function that build a short youtube URL based on a youtube ID. This will help to standardize the youtube url that we will now save.

The file name will be named as follow: `{youtubeID}_{formated_name}.md`.

The file content will be formatted as follow:

```file-content
# Transcript

## Information

Channel: {youtube channel (author)}
Title: {original_title}
Youtube ID: {youtube ID}
URL: {short youtube URL}

## Content

[The transcript]
```

Inside the centralized data.json where saving all files information, we will now have:

```json
  "F-m4AIU8blY": {
    "date_added": "2025-11-19",
    "channel": "..."
    "title": "..." (original title)
    "links": [
      "..."
    ]
  }
```

## Integration Workflow

### 1. Update all documentation

For each file inside ./docs, you will run a subagent ( use the appropriate agents if any exist, example for functional requirement use agt-doc-functional, or no specific agent if no match ) that will modify the file to add the content related to this update.

You will proceed in the very specific order, one agent at a time to ensure coherence:

1) Project Overview
2) Functional Requirements
3) Technical Requirements
4) Tasks
5) Any other files in the docs folder

### 2. Plan

Run the agent to plan this implementation and the one to review the plan. The agent should carefully consider all change needed in the entire codebase.

### 3. Implement

Run the implementation agent.

### 4. Clean data.json

Clean data in centralized data.json to ensure the following test does not come from the cache.

### 5. Run

Run the script inside ./test-transcriptor and verify the file names, the files content and the centralized data.json

### 6. Fix any issue

If it does not works as expected, investigate, test and fix.
