const SOCIAL_CRAWLER_PATTERN = /telegrambot|whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|skypeuripreview|pinterest|vkshare|redditbot|embedly|quora link preview|outbrain|rogerbot/i;

function isSocialCrawler(userAgent = "") {
  return SOCIAL_CRAWLER_PATTERN.test(String(userAgent));
}

module.exports = { isSocialCrawler };
