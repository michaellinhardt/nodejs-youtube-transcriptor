async function getVideoTitleOEmbed(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(data.title);
    return data.title;
  } catch (error) {
    console.error('Error fetching oEmbed data:', error.message);
    return null;
  }
}

// Test with video ID
getVideoTitleOEmbed('F-m4AIU8blY')
  .then(title => {
    console.log('Title retrieved:', title);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
