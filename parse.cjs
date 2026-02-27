const cheerio = require("cheerio");
const TurndownService = require("turndown");

// Initialize Turndown
const turndownService = new TurndownService();

const slugToTitle = (slug) => {
  if (!slug) return "Unknown";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

module.exports = function parse(html, filename) {
  const $ = cheerio.load(html);
  const storyContent = $("section.story-content");

  // Clean up unwanted elements before conversion
  storyContent.find("div").remove();
  storyContent.find("script").remove();
  storyContent.find("br").remove();

  let mainContentHtml = storyContent.html();

  if (!mainContentHtml) {
    console.error(`  ✖ No content found in ${filename}`);
    return null;
  }

  // Fix internal links
  mainContentHtml = mainContentHtml.replaceAll(
    "https://www.antarvasna3.com/",
    "/",
  );

  // Convert the cleaned HTML to Markdown
  const markdownContent = turndownService.turndown(mainContentHtml.trim());

  // Calculate reading time
  const plainText = storyContent.text().trim();
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const readingTime = Math.ceil(words / 200) + " min";

  // ==========================================
  // 🕵️ SLUG EXTRACTION ENGINE
  // ==========================================
  let targetUrl = null;
  let jsonLd = null;

  // 1. Try to extract from JSON-LD first
  try {
    const ldJsonElements = $('script[type="application/ld+json"]');
    if (ldJsonElements.length) {
      ldJsonElements.each((i, elem) => {
        try {
          const parsed = JSON.parse($(elem).html());
          if (parsed && parsed["@type"] === "Article") {
            jsonLd = parsed;
            // Grab the URL from either property
            targetUrl = parsed.url || parsed.mainEntityOfPage?.["@id"];
            return false; // Break out of the each loop once found
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // 2. Fallback to Canonical Link if JSON-LD is missing or broken
  if (!targetUrl) {
    targetUrl = $('link[rel="canonical"]').attr("href");
  }

  // 3. Safely parse the URL to get the exact slugs
  let rawSlug = filename.replace(".html", ""); // Absolute last resort fallback
  let rawGenreSlug = "uncategorized";

  if (targetUrl) {
    try {
      // Using Node's native URL parser is way safer than split("/")
      const urlObj = new URL(targetUrl);

      // urlObj.pathname looks like "/genre/story-title/"
      const pathSegments = urlObj.pathname.split("/").filter(Boolean);

      if (pathSegments.length >= 2) {
        rawSlug = pathSegments.pop(); // e.g., "20-saal-ladki-ki-gand"
        rawGenreSlug = pathSegments.pop(); // e.g., "lana-gand-chudai-female"
      } else if (pathSegments.length === 1) {
        rawSlug = pathSegments.pop();
      }
    } catch (err) {
      // If the URL is somehow malformed, we just stick to the filename fallback
    }
  }

  return {
    slug: rawSlug,
    frontmatter: {
      title: (jsonLd?.headline || $("h1").first().text() || rawSlug).trim(),
      author: (
        jsonLd?.author?.name ||
        $('meta[name="author"]').attr("content") ||
        "ghost"
      ).trim(),
      excerpt: (
        jsonLd?.description ||
        $('meta[name="description"]').attr("content") ||
        ""
      ).trim(),
      genre: {
        name: slugToTitle(rawGenreSlug),
        slug: rawGenreSlug,
      },
      reading_time: readingTime,
      created_at: (jsonLd?.datePublished || new Date().toISOString()).trim(),
      word_count: words,
    },
    content: markdownContent,
  };
};
