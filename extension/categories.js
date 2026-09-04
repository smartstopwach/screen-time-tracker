// ── Shared site-category rules (used by popup + dashboard) ──────────────────

var CATEGORIES = [
  {
    id: 'work', label: 'Work', color: '#5b8def',
    domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'notion.so',
      'figma.com', 'slack.com', 'zoom.us', 'teams.microsoft.com', 'office.com',
      'outlook.com', 'atlassian.net', 'linear.app', 'asana.com', 'trello.com',
      'clickup.com', 'vercel.com', 'netlify.com', 'openai.com', 'chatgpt.com',
      'claude.ai', 'gemini.google.com', 'mail.google.com', 'gmail.com',
      'calendar.google.com', 'drive.google.com', 'docs.google.com',
      'sheets.google.com', 'slides.google.com', 'aws.amazon.com',
      'cloud.google.com', 'azure.microsoft.com', 'digitalocean.com',
      'bitbucket.org', 'basecamp.com', 'monday.com', 'workplace.com']
  },
  {
    id: 'social', label: 'Social', color: '#e0679e',
    domains: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com',
      'threads.net', 'whatsapp.com', 'web.whatsapp.com', 'telegram.org',
      'web.telegram.org', 'snapchat.com', 'linkedin.com', 'reddit.com',
      'pinterest.com', 'discord.com', 'quora.com', 'tumblr.com',
      'mastodon.social', 'hinge.co', 'tinder.com', 'bumble.com']
  },
  {
    id: 'entertainment', label: 'Entertainment', color: '#e0a23c',
    domains: ['youtube.com', 'youtu.be', 'netflix.com', 'primevideo.com',
      'hotstar.com', 'disneyplus.com', 'jiocinema.com', 'twitch.tv',
      'mxplayer.in', 'spotify.com', 'soundcloud.com', 'sonyliv.com',
      'zee5.com', 'imdb.com', 'crunchyroll.com', 'steamcommunity.com',
      'roblox.com', 'pbskids.org', 'voot.com']
  },
  {
    id: 'learning', label: 'Learning', color: '#3cb583',
    domains: ['khanacademy.org', 'coursera.org', 'udemy.com', 'edx.org',
      'duolingo.com', 'w3schools.com', 'geeksforgeeks.org', 'leetcode.com',
      'hackerrank.com', 'codecademy.com', 'freecodecamp.org',
      'developer.mozilla.org', 'nptel.ac.in', 'byjus.com', 'pw.live',
      'toppr.com', 'vedantu.com', 'unacademy.com', 'brainly.in',
      'tutorialspoint.com', 'javatpoint.com', 'programiz.com']
  },
  {
    id: 'shopping', label: 'Shopping', color: '#e07c42',
    domains: ['amazon.in', 'amazon.com', 'flipkart.com', 'myntra.com',
      'meesho.com', 'ajio.com', 'nykaa.com', 'ebay.com', 'walmart.com',
      'aliexpress.com', 'bigbasket.com', 'zepto.com', 'blinkit.com',
      'swiggy.com', 'zomato.com', 'dominos.in', 'shopify.com',
      'tatacliq.com', 'croma.com', 'reliancedigital.in', 'firstcry.com']
  },
  {
    id: 'news', label: 'News', color: '#3fb4c9',
    domains: ['news.google.com', 'timesofindia.indiatimes.com',
      'indianexpress.com', 'hindustantimes.com', 'ndtv.com', 'bbc.com',
      'cnn.com', 'republicworld.com', 'abplive.com', 'dnaindia.com',
      'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
      'thehindu.com', 'livemint.com', 'economictimes.indiatimes.com',
      'espn.com', 'cricbuzz.com', 'sportskeeda.com']
  },
  {
    id: 'search', label: 'Search', color: '#9a80e8',
    domains: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com',
      'search.brave.com', 'ecosia.org', 'yandex.com', 'baidu.com',
      'perplexity.ai', 'wikipedia.org']
  },
  {
    id: 'other', label: 'Other', color: '#8b93a1',
    domains: []
  }
];

var CATEGORY_MAP = {};
CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.id] = c; });

function categoryById(id) {
  return CATEGORY_MAP[id] || CATEGORY_MAP.other;
}

// exact match first, then subdomain suffix match; user override wins
function classifySite(domain, overrides) {
  if (overrides && overrides[domain]) {
    var ov = CATEGORY_MAP[overrides[domain]];
    if (ov) return ov;
  }
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].domains.indexOf(domain) !== -1) return CATEGORIES[i];
  }
  for (var j = 0; j < CATEGORIES.length; j++) {
    var doms = CATEGORIES[j].domains;
    for (var k = 0; k < doms.length; k++) {
      if (domain.endsWith('.' + doms[k])) return CATEGORIES[j];
    }
  }
  return CATEGORY_MAP.other;
}
