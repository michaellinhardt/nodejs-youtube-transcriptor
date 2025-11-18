I want to make an API call to <https://api.scrapecreators.com/v1/youtube/video/transcript>.

Here are the details:

Endpoint: GET <https://api.scrapecreators.com/v1/youtube/video/transcript>

Description: Get transcript of a video or short

Required Headers:

- x-api-key: Your API key

  Parameters:

- url (Required): YouTube video or short URL
  Example Response:
  {
  "videoId": "bjVIDXPP7Uk",
  "type": "video",
  "url": "<https://www.youtube.com/watch?v=bjVIDXPP7Uk>",
  "transcript": [
  {
  "text": "welcome back to the hell farm and the",
  "startMs": "160",
  "endMs": "1920",
  "startTimeText": "0:00"
  },
  {
  "text": "backyard trails we built these jumps two",
  "startMs": "1920",
  "endMs": "3919",
  "startTimeText": "0:01"
  }
  ],
  "transcript_only_text": "welcome back to the hell farm and the backyard trails we built these jumps two years ago and last year we just kind of rebuilt them and this year......",
  "language": "English"
  }
