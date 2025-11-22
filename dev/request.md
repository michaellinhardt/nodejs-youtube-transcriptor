# Request

Sometime the formatted youtube title appear as `unknown_title` and when I retry it appears with the right title.

Can you add some rule to the API call who manage the title ?

After formatting the title if it appears to be `unknown_title` you will make the script sleep 3sc and re-try.

This should retry a maximum of 3 times after the first fail and if it is still `unknown_title` then its file, we save the file with this title.

To verify if it works, you will go into the `./test-transcriptor` folder and run the `transcriptor` command. It should console.log when there is an API error and retries so you can verify if the process works.

If the process works directly from the first time, therefor you can not verify your implementation, use the following command to test again:

`transcriptor clean 2025-12-01 && rm -rf ~/dev/nodejs-youtube-transcriptor/test-transcriptor/transcripts` it will purge all result and you can run again `transcriptor`. The purpose is to have an API fail and to observe the script doing it's retry to get the right title. If you can not have a title failing after 3 attempt ( cleaning and retry ) then stop to avoid too much api cost.

## Implementation Workflow

- For each file into the docs folder, run the appropriate agent, one by one, to edit the documentation accordingly first.
- The tasks agent will also add the appropriate task to the task file.

Then you will run the agent for code plan followed by the agent for code implementation. You will then make your test as described above.

If it does not work, fix it and re-test.
