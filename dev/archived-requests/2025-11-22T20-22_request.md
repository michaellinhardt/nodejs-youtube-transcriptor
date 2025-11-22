# Request

We are going to modify the script behavior.

## Feature changes

### data.json

The object for one video will now be as follow:

```json
  "F-m4AIU8blY": {
    "date_added": "251119THHMM", // CHANGE FORMAT(YYMMDDTHHMM), ADD TIME 
    "channel": "...", // FORMATED WITH SAME FUNCTION FOR TITLE
    "title": "...", // NOW THE FORMATED VERSION
  }
```

- The channel will be formated with the same function to format title.
- The title is saved in its formated version
- The date_added format is changed
- The array with path to links is removed

### transcripts files

Inside the folder `transcripts` where is summoned the command transcriptor, as well as inside the `transcripts` folder in `~/.transcriptor` the transcripts files are now going to be named as follow `transcript_{youtubeID}_title.md` ( title is the formatted version )

### Cleaning routine

- It does not delete linked file anymore since we removed the array.
- The input date is the same but it use the new date format in date_added to detect the file and it ignore the time parameter.

#### Transcript files

Few changes in information session.

- Channel is the formatted version
- Title is the formatted version

```transcript file
# Transcript

## Information

Channel: {channel} ( formatted version )
Title: {title} ( formatted version )
Youtube ID: {youtube ID}
URL: {short youtube URL}

## Content

[The transcript]
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

Instruct the tasks agent to make all the tasks related to this changes in one single main task ( X.X ) and to use sub-task ( X.X.X ) to properly separate each steps.

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
