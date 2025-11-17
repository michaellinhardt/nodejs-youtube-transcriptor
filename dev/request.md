![[../../../11. CLAUDE-CODE/claude-agents/agt-doc-overview]]

# My Request

## Task

Use the appropriate agent to write the project overview based on my project description below.

## Project Description

This repository is an npm package that will be installed globally to provide the command "transcriptor" for command line.

The package is not published because it will not have a strong maintenance, instead it is used with `npm link`

The command `transcriptor` is used to turn a list of youtube URL into MD file containing the transcript of those youtube videos.

## Project Workflow

The user type `transcriptor` in it's terminal.

-> If there is no file youtube.md in the current folder, it return the help, similarly as the command `transcriptor help`

The script will load the youtube URLs in the file youtube.md, one URL per line. It will trim the line and extract the Youtube ID for each line.

For each youtube ID collected, the script will use the `Scrape Creators` API with the provided API key from the env file and collect the transcript for this URL.

The script will then create a folder `transcripts` if it does not exist and add a link to the transcript MD file inside this folder. The link come from the centralized folder of the package which is described in `Extra Features`

The MD file name is the youtube ID, example for an ID `Jhxlewf83` the link name inside transcripts folder will be Jhxlewf83.md

From the API, it collect the string located at the property `transcript_only_text` which is a single string containing the entire transcript, without timestamp or other information. This is what should contain the file, the entire string of the transcript and nothing else.

## Extra features

### Centralized .transcriptor folder

The script should have a folder inside the user environment folder ( /User/{username} or ~/ ) where it will store already collected transcripts. The folder name is `.transcriptor` and it contain a data.json file + a folder transcripts with all the transcripts file.

The data.json carry an object used as database for all collected transcript and is formatted as follow:

```json
{
  [transcript-id]:
    {
      date_added: "YYYY-MM-DD",
      links: ["array of string, describign where this file had been linked"],
    },
}
```

date_added is the date when we first fetched the transcript.
links is an array containing the path to each folder where we created a link to this file.

example:

```json
{
  "Jhxlewf83":
    {
      date_added: "2025-11-20",
      links: [
          '~/Download/transcripts',
          '~/project_one/transcripts',
          '~/project_two/transcripts',
      ],
    },
}
```

Then in the transcripts folder will lay the associated file `Jhxlewf83.md`

### Do not use API for existing transcripts

When the youtube.md file contain a youtube link with an ID already listed in ~/.transcriptor/data.json it will simply create the link from the existing file ~/.transcriptor/transcripts folder into the current folder, it avoid to use the API for a transcript we already collected.

### Maintenance commands

`transcriptor data` will display the following information:

```terminal
Total transcripts saved: 235
Total size of .transcriptor folder: 2344MB
Oldest transcript added: 2025-01-10
Newest transcript added: 2025-11-20
```

`transcriptor clean YYYY-MM-DD` will remove from data.json all the entry older than the date given, excluding the date given itself and it will also delete the md file associated. It will also delete all links generated.

To delete links, if the youtube ID is `Jhxlewf83` and the links array is:


```json
      links: [
          '~/Download/transcripts',
          '~/project_one/transcripts',
          '~/project_two/transcripts',
      ],
```

it will attempt to delete the link to this file in each folders listed. The purpose is to avoid having left over when we delete a file.

### Auto maintenance

Every time the script run, it first verify if each entry in data.json from the centralized folder, for each ID listed in this object, it check if there is the proper file associated in the transcripts folder. If not, it will operate the clean process on this entry, removing all links existing and then the entry in data.json

### data.json operations

To edit this file, the script always re-write entirely the file data.json. It always load the object in memory, and each operation that modify the object content will re-generate the file writing it over entirely rather than editing specific line, to ensure consistency.

Also the script proceed writing operation after each change operated on one youtube ID. Example, when it clean one Youtube ID entry from the file, it does all the deletion of file in transcripts folder + all links, and when done, it re-write the entire data.json file without this entry. Then it move to the next entry to clean. When it fetch a list of 10 youtube transcripts, after each transcript fetched, it immediatly write the MD file and the link, then re-write data.json and then move to the next fetch. However it does not edit the youtube.md initial file so if it crash it will proceed again the entire list of URL, however the one already collected will be saved in .transcriptor so it wont generate a new API call and it should move to next one quickly.