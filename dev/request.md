# Request

Add another flag similar to --rag-generator

when using --rag-generator-gemini it will use the command /rag-generator-gemini from claude instead of /rag-generator

## Implementation Workflow

- For each file into the docs folder, run the appropriate agent, one by one, to edit the documentation accordingly first.
- The tasks agent will also add the appropriate task to the task file.

Then you will run the agent for code plan followed by the agent for code implementation. You will then make your test as described above.

If it does not work, fix it and re-test.
