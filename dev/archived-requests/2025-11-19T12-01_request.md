# Request

In the folder ./test-transcriptor is a youtube.md file with 3 youtube URLs.

Use transcriptor from inside this folder to see if he does what is expected:

It should:

1) Read the file youtube.md
2) For each Youtube URLs in the file, fetch the transcript via the API
3) Save the transcript into ./test-transcriptor/transcripts
