# Request

Add a feature, when use the command with `--rag-generator` argument, the script once finish to execute, will go into the transcripts folder ( cd ./transcripts ) and then execute the commande `claude --dangerously-skip-permissions -p /rag-generator`

Dont test it, I will make the test myself.

## Implementation Workflow

- For each file into the docs folder, run the appropriate agent, one by one, to edit the documentation accordingly first.
- The tasks agent will also add the appropriate task to the task file.

Then you will run the agent for code plan followed by the agent for code implementation. You will then make your test as described above.

If it does not work, fix it and re-test.
