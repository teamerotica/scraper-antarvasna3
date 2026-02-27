const fs = require("fs-extra");
const path = require("path");
const Database = require("better-sqlite3");

// Connect to our SQLite database
const db = new Database("scraped_data.db");
const PAGE_SIZE = 70; // 70 stories per page

async function exportData() {
  console.log("🚀 Starting Phase 2: Exporting SQLite to JSON structure...\n");

  const baseOutDir = path.join(__dirname, "out");
  const storiesOutDir = path.join(baseOutDir, "stories");
  await fs.ensureDir(storiesOutDir);

  let totalStoriesExported = 0;

  // ======================================================================
  // 1. GENERATE THE GLOBAL "LATEST" INDEX (All stories, newest to oldest)
  // ======================================================================
  console.log(`\n🌍 Generating Global 'Latest' Index...`);

  // FIXED: Order by the actual creation date, newest first.
  const allStories = db
    .prepare(
      `
    SELECT * FROM stories 
    ORDER BY createdAt DESC, id DESC
  `,
    )
    .all();

  const latestPagesDir = path.join(baseOutDir, "latest", "pages");
  await fs.ensureDir(latestPagesDir);

  const totalGlobalPages = Math.ceil(allStories.length / PAGE_SIZE);

  for (let page = 1; page <= totalGlobalPages; page++) {
    const startIndex = (page - 1) * PAGE_SIZE;
    const chunk = allStories.slice(startIndex, startIndex + PAGE_SIZE);
    const pageIndexData = [];

    for (const story of chunk) {
      let parsedDate;
      try {
        parsedDate = new Date(story.createdAt);
        // Fallback if the date string is completely mangled
        if (isNaN(parsedDate.getTime())) parsedDate = new Date();
      } catch (e) {
        parsedDate = new Date();
      }

      const indexItem = {
        id: story.slug,
        title: story.title,
        link: `/story/${story.slug}`,
        author: story.author || "Anonymous",
        authorLink: null,
        description: story.excerpt || "",
        rating: "N/A",
        reads: 0,
        posted: parsedDate.toDateString(),
        posted_iso: parsedDate.toISOString(),
        tags: [story.genre],
      };

      pageIndexData.push(indexItem);

      // We only need to save the full content JSON files ONCE.
      const fullStoryData = {
        ...indexItem,
        content: story.content,
      };

      await fs.writeJson(
        path.join(storiesOutDir, `${story.slug}.json`),
        fullStoryData,
        { spaces: 2 },
      );
      totalStoriesExported++;
    }

    await fs.writeJson(
      path.join(latestPagesDir, `${page}.json`),
      pageIndexData,
      { spaces: 2 },
    );
  }
  console.log(`  ✔ Saved ${totalGlobalPages} pages to out/latest/pages/`);

  // ======================================================================
  // 2. GENERATE THE GENRE-SPECIFIC INDEXES
  // ======================================================================
  const genres = db
    .prepare("SELECT DISTINCT genre FROM stories WHERE genre IS NOT NULL")
    .all()
    .map((row) => row.genre);

  console.log(
    `\n📁 Generating category indexes for ${genres.length} unique genres...`,
  );

  for (const genre of genres) {
    if (!genre) continue;

    // FIXED: Order by the actual creation date for genres as well.
    const genreStories = db
      .prepare(
        `
      SELECT * FROM stories 
      WHERE genre = ? 
      ORDER BY createdAt DESC, id DESC
    `,
      )
      .all(genre);

    const pagesDir = path.join(baseOutDir, "genres", genre, "pages");
    await fs.ensureDir(pagesDir);

    const totalPages = Math.ceil(genreStories.length / PAGE_SIZE);

    for (let page = 1; page <= totalPages; page++) {
      const startIndex = (page - 1) * PAGE_SIZE;
      const chunk = genreStories.slice(startIndex, startIndex + PAGE_SIZE);
      const pageIndexData = [];

      for (const story of chunk) {
        let parsedDate;
        try {
          parsedDate = new Date(story.createdAt);
          if (isNaN(parsedDate.getTime())) parsedDate = new Date();
        } catch (e) {
          parsedDate = new Date();
        }

        pageIndexData.push({
          id: story.slug,
          title: story.title,
          link: `/story/${story.slug}`,
          author: story.author || "Anonymous",
          authorLink: null,
          description: story.excerpt || "",
          rating: "N/A",
          reads: 0,
          posted: parsedDate.toDateString(),
          posted_iso: parsedDate.toISOString(),
          tags: [story.genre],
        });
      }

      await fs.writeJson(path.join(pagesDir, `${page}.json`), pageIndexData, {
        spaces: 2,
      });
    }
    console.log(`  ✔ Saved genres/${genre}/pages/ (${totalPages} pages)`);
  }

  console.log(
    `\n🎉 Phase 2 Complete! Exported ${totalStoriesExported} total stories into normalized JSON.`,
  );
}

exportData().catch((err) => {
  console.error("Fatal Error during export:", err);
});
