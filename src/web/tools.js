// Free single-purpose tools. Each one is a real, useful page targeting a
// specific search ("meta tag checker", "robots.txt checker"…) and runs a
// focused subset of the full audit. They are the SEO entry points to the
// main product.

export const TOOLS = {
  'meta-tag-checker': {
    checks: ['title-missing', 'title-length', 'meta-description-missing', 'meta-description-length', 'canonical-missing', 'canonical-multiple', 'page-noindex', 'viewport-missing', 'charset-missing', 'html-lang-missing'],
    crawl: { maxPages: 1 },
    name: 'Meta Tag Checker',
    h1: 'Free Meta Tag Checker',
    title: 'Free Meta Tag Checker: Title, Description, Canonical & Robots',
    description: 'Check the title tag, meta description, canonical, robots and viewport tags of any page in seconds. Free, no signup, with clear fixes.',
    intro: 'Paste a URL to see exactly what search engines read in the <head> of the page: title, meta description, canonical URL, robots directives, viewport and language. Every problem comes with an explanation and a copy-paste fix.',
    sections: [
      ['Why meta tags still matter', 'The title tag is the clickable headline in Google and one of the strongest on-page signals. The meta description does not change rankings, but it is the sales pitch below that headline: a good one can noticeably raise your click-through rate. Canonical and robots tags decide whether the page is indexed at all, so a single wrong value can remove a page from search.'],
      ['What this checker verifies', 'Presence and length of the title (15–60 characters) and meta description (50–160 characters), a single canonical URL, accidental "noindex" in the meta robots tag or X-Robots-Tag header, the mobile viewport tag, the character encoding and the html lang attribute.'],
      ['Common mistakes we see', 'A "noindex" left over from a staging site; the same title on every page because a CMS template was never customised; two canonical tags added by two different plugins; titles over 70 characters that Google truncates.'],
    ],
    faq: [
      ['How long should a title tag be?', 'Aim for 50–60 characters. Google truncates by pixel width, so very wide letters reach the limit sooner. Put the main keyword first and your brand last.'],
      ['Does Google always use my meta description?', 'No. Google rewrites it when it thinks another passage answers the query better. A specific, accurate description is used far more often than a generic one.'],
      ['Do meta keywords help?', 'No. Google has ignored the meta keywords tag since 2009, so this checker does not evaluate it.'],
    ],
  },
  'robots-txt-checker': {
    checks: ['robots-txt-missing', 'robots-txt-blocks-all', 'sitemap-not-in-robots', 'pages-blocked-by-robots', 'page-noindex'],
    crawl: { maxPages: 5, maxDepth: 1 },
    name: 'Robots.txt Checker',
    h1: 'Robots.txt Checker',
    title: 'Robots.txt Checker: Find Rules That Block Google',
    description: 'Fetch and test your robots.txt: detect "Disallow: /", blocked pages and a missing Sitemap line. Free and instant.',
    intro: 'This tool downloads your robots.txt, parses it the way search engine crawlers do (RFC 9309: most specific rule wins, Allow wins ties) and tests it against the pages linked from your homepage.',
    sections: [
      ['What robots.txt does (and does not do)', 'robots.txt tells crawlers which URLs they may request. It does not hide a page from search results: a blocked URL can still be indexed if other sites link to it. To keep a page out of Google, use a noindex tag and let it be crawled.'],
      ['The mistake that costs the most', 'A "User-agent: * / Disallow: /" copied from a development server blocks the entire site. Rankings then decline over the following days and weeks. This checker flags it as critical.'],
      ['Good practice', 'Keep robots.txt short, block only genuinely useless areas (admin, cart, internal search results) and add a Sitemap line so every crawler finds your sitemap.'],
    ],
    faq: [
      ['Where must robots.txt be located?', 'At the root of the host: https://www.example.com/robots.txt. A file in a sub-folder is ignored, and each subdomain needs its own.'],
      ['Is an empty Disallow line a problem?', 'No. "Disallow:" with no value means "allow everything".'],
      ['Should I block CSS and JavaScript?', 'No. Google renders pages like a browser and needs those files to understand the layout and mobile-friendliness.'],
    ],
  },
  'sitemap-checker': {
    checks: ['sitemap-missing', 'sitemap-invalid', 'sitemap-not-in-robots', 'robots-txt-missing'],
    crawl: { maxPages: 1 },
    name: 'Sitemap Checker',
    h1: 'XML Sitemap Checker',
    title: 'XML Sitemap Checker: Find and Validate Your sitemap.xml',
    description: 'Find your XML sitemap (robots.txt, /sitemap.xml, /sitemap_index.xml), validate its format and count its URLs. Free.',
    intro: 'We look for your sitemap where crawlers do: the Sitemap line of robots.txt, then /sitemap.xml and /sitemap_index.xml. We check that it is real sitemap XML (urlset or sitemapindex) and count the URLs it lists.',
    sections: [
      ['When a sitemap matters most', 'Large sites, new sites with few backlinks, and sites with pages that are hard to reach through links benefit the most. For a five-page site it is a nice-to-have; for an online shop it is essential.'],
      ['Frequent sitemap problems', 'An HTML error page served at /sitemap.xml, a sitemap listing redirected or noindex URLs, or a sitemap that exists but is referenced nowhere.'],
      ['Next step', 'Once the sitemap is valid, submit it in Google Search Console and Bing Webmaster Tools, then watch the "Discovered" and "Indexed" counts.'],
    ],
    faq: [
      ['How many URLs can a sitemap contain?', 'Up to 50,000 URLs or 50 MB uncompressed per file. Larger sites use a sitemap index that lists several sitemaps.'],
      ['Should every page be in the sitemap?', 'Only canonical, indexable pages that return HTTP 200. Leave out redirects, error pages and noindex pages.'],
    ],
  },
  'heading-checker': {
    checks: ['h1-missing', 'h1-multiple', 'h2-missing', 'heading-order-skipped'],
    crawl: { maxPages: 1 },
    name: 'Heading Checker',
    h1: 'H1–H6 Heading Checker',
    title: 'Heading Checker: Analyze H1, H2, H3 Structure of Any Page',
    description: 'See the full H1–H6 outline of a page, find missing or multiple H1 and skipped heading levels. Free SEO and accessibility check.',
    intro: 'Headings are the table of contents of a page. This tool extracts every heading in order so you can see the outline exactly as screen readers and search engines do.',
    sections: [
      ['Why heading structure matters', 'Screen-reader users jump from heading to heading to scan a page, just as sighted visitors skim bold titles. Search engines use the same outline to understand the main topic and sub-topics.'],
      ['Rules of thumb', 'One H1 describing the page; H2 for main sections; H3 for sub-sections inside an H2; never choose a level for its font size (use CSS for that).'],
    ],
    faq: [
      ['Is having two H1 tags penalised by Google?', 'Not directly. But a single clear H1 makes the main topic unambiguous for users, assistive technologies and search engines.'],
      ['My logo is an H1, is that wrong?', 'On inner pages, yes: every page would have the same H1. Keep the logo as a link or image and give each page its own H1.'],
    ],
    showOutline: true,
  },
  'open-graph-checker': {
    checks: ['open-graph-missing', 'twitter-card-missing', 'structured-data-missing', 'structured-data-invalid'],
    crawl: { maxPages: 1 },
    name: 'Open Graph Checker',
    h1: 'Open Graph & Social Preview Checker',
    title: 'Open Graph Checker: Preview How Your Link Looks When Shared',
    description: 'Check og:title, og:description, og:image and Twitter card tags, and preview your social share card. Free, no signup.',
    intro: 'When someone shares your link on LinkedIn, Facebook, WhatsApp, Slack or X, these platforms read Open Graph tags to build the preview card. This tool shows what they read and what is missing.',
    sections: [
      ['The three tags that matter', 'og:title (a short headline), og:description (one sentence), og:image (1200×630 px, under 5 MB, absolute https URL). Add twitter:card="summary_large_image" to get a large image on X.'],
      ['Why previews fail', 'Relative image URLs, images blocked by robots.txt, or caches on the social platform that still hold an old version (use each platform’s debugger to refresh).'],
    ],
    faq: [
      ['Do Open Graph tags improve SEO?', 'Not directly, but attractive previews get more clicks and shares, which brings visitors and links.'],
    ],
    showSocial: true,
  },
  'image-alt-checker': {
    checks: ['img-alt-missing', 'heavy-images', 'legacy-image-formats', 'images-no-dimensions', 'images-no-lazy-loading'],
    crawl: { maxPages: 1 },
    name: 'Image Alt Text Checker',
    h1: 'Image Alt Text & Image SEO Checker',
    title: 'Image Alt Text Checker: Find Missing Alt Attributes and Heavy Images',
    description: 'List every image on a page with its alt text, size and format. Find missing alt attributes, oversized files and CLS risks. Free.',
    intro: 'This tool lists the images of a page, flags missing alt text (accessibility and Google Images), measures file sizes, and spots images without width/height that make the layout jump.',
    sections: [
      ['Writing good alt text', 'Describe what the image shows and why it is there, in a short sentence. "Craftsman stitching a leather bag" beats "image1.jpg" or a list of keywords. Purely decorative images should have alt="" so screen readers skip them.'],
      ['Image weight', 'Images are usually the heaviest part of a page. Resize to the displayed size, convert to WebP or AVIF, and lazy-load images below the fold.'],
    ],
    faq: [
      ['Is an empty alt="" an error?', 'No. It is the correct way to mark a decorative image. A missing alt attribute is the problem.'],
    ],
    showImages: true,
  },
  'broken-link-checker': {
    checks: ['broken-internal-links', 'broken-external-links', 'redirect-chains', 'page-errors', 'broken-resources'],
    crawl: { maxPages: 5, maxDepth: 1, maxLinksToCheck: 80 },
    name: 'Broken Link Checker',
    h1: 'Broken Link Checker',
    title: 'Broken Link Checker: Find 404 Links and Redirect Chains',
    description: 'Scan a page and the pages it links to for broken links (404, 500), dead external links and redirect chains. Free online check.',
    intro: 'We follow the links of your page (and a few pages behind it), request every target and report the ones that end in an error, plus links that go through several redirects.',
    sections: [
      ['Why broken links hurt', 'Each dead link is a visitor who hits a wall, and wasted crawl budget for search engines. On product or contact pages it is lost revenue.'],
      ['How to fix them', 'Update the link to the correct URL, or add a permanent (301) redirect from the old address to the closest live page. Avoid redirecting everything to the homepage.'],
    ],
    faq: [
      ['Why is an external link reported as fine while it fails in my browser?', 'Some sites block automated requests or require a login. We only flag external links that clearly answer 404 or 410 to avoid false alarms.'],
    ],
  },
  'website-speed-checker': {
    checks: ['slow-server-response', 'page-weight-high', 'heavy-images', 'compression-missing', 'render-blocking-scripts', 'too-many-requests', 'cache-headers-missing', 'html-too-large', 'core-web-vitals-poor'],
    crawl: { maxPages: 1 },
    name: 'Website Speed Checker',
    h1: 'Website Speed Checker',
    title: 'Website Speed Checker: Server Response, Page Weight & Render Blocking',
    description: 'Measure server response time, page weight, heavy images, compression and render-blocking scripts of any page. Free speed test with fixes.',
    intro: 'This speed check measures what can be measured precisely from a server: response time, the weight of the page and each resource, compression, caching and scripts that block rendering. When configured, Core Web Vitals come from Google PageSpeed Insights.',
    sections: [
      ['What slows most websites down', 'In order of frequency: oversized images, slow hosting without page cache, too many third-party scripts (chat widgets, trackers), and missing compression.'],
      ['Lab data vs real users', 'A single test is a snapshot from one location. Core Web Vitals field data (from real Chrome users) is the reference Google uses for ranking.'],
    ],
    faq: [
      ['What is a good server response time?', 'Under 800 ms for the first byte is the commonly used threshold; under 200 ms is excellent.'],
    ],
  },
};

export const TOOL_SLUGS = Object.keys(TOOLS);
