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

  // --- NEW: Convert the cleaned HTML to Markdown ---
  const markdownContent = turndownService.turndown(mainContentHtml.trim());

  // Calculate reading time (using Cheerio's raw text for accurate word count)
  const plainText = storyContent.text().trim();
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const readingTime = Math.ceil(words / 200) + " min";

  // Try to get JSON-LD data
  let jsonLd = null;
  try {
    const ldJsonElements = $('script[type="application/ld+json"]');
    if (ldJsonElements.length) {
      ldJsonElements.each((i, elem) => {
        try {
          const parsed = JSON.parse($(elem).html());
          if (parsed && parsed["@type"] === "Article") {
            jsonLd = parsed;
            return false;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Fallback for ID if JSON-LD fails
  let idArray = jsonLd?.mainEntityOfPage?.["@id"]?.split("/") || [];
  let rawSlug = idArray[4] || filename.replace(".html", "");
  let rawGenreSlug = idArray[3] || "uncategorized";

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
    // We now return the Markdown string instead of HTML!
    content: markdownContent,
  };
};
