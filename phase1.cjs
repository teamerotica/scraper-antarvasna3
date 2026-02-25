const fs = require("fs-extra");
const path = require("path");
const Database = require("better-sqlite3");
const parse = require("./parse.cjs");

// 1. Initialize DB (Creates scraped_data.db if it doesn't exist)
const db = new Database("scraped_data.db");

// 2. Create Table exactly matching your Prisma schema
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    title TEXT,
    author TEXT,
    excerpt TEXT,
    genre TEXT,
    readingTime TEXT,
    createdAt DATETIME,
    wordCount INTEGER,
    content TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_slug ON stories(slug);
  CREATE INDEX IF NOT EXISTS idx_title ON stories(title);
  CREATE INDEX IF NOT EXISTS idx_genre ON stories(genre);
`);

// Prepared statements for massive speed gains
const checkSlugStmt = db.prepare(`SELECT slug FROM stories WHERE slug = ?`);
const insertStoryStmt = db.prepare(`
  INSERT INTO stories (slug, title, author, excerpt, genre, readingTime, createdAt, wordCount, content)
  VALUES (@slug, @title, @author, @excerpt, @genre, @readingTime, @createdAt, @wordCount, @content)
`);

function generateUniqueSlug(baseSlug) {
  let slug = baseSlug.slice(0, 150).replace(/-+$/, "");
  let counter = 1;

  while (true) {
    const exists = checkSlugStmt.get(slug);
    if (!exists) return slug;

    const suffix = `-${counter}`;
    slug = `${baseSlug.slice(0, 150 - suffix.length)}${suffix}`;
    counter++;
  }
}

async function processHtmlFiles() {
  const inputDir = path.join(__dirname, "raw_html");
  await fs.ensureDir(inputDir);

  const files = await fs.readdir(inputDir);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));

  console.log(
    `Found ${htmlFiles.length} HTML files to process into SQLite...\n`,
  );

  // We wrap inserts in a transaction for extreme speed (inserts thousands per second)
  const insertMany = db.transaction((filesList) => {
    let count = 0;
    for (const file of filesList) {
      const htmlContent = fs.readFileSync(path.join(inputDir, file), "utf-8");
      const data = parse(htmlContent, file);

      if (!data) continue;

      const uniqueSlug = generateUniqueSlug(data.slug);

      try {
        insertStoryStmt.run({
          slug: uniqueSlug,
          title: data.frontmatter.title,
          author: data.frontmatter.author,
          excerpt: data.frontmatter.excerpt,
          genre: data.frontmatter.genre.slug,
          readingTime: data.frontmatter.reading_time,
          createdAt: data.frontmatter.created_at,
          wordCount: data.frontmatter.word_count,
          content: data.content,
        });
        count++;
        console.log(`  ✔ Inserted: ${uniqueSlug}`);
      } catch (err) {
        console.error(`  ✖ DB Error on ${uniqueSlug}:`, err.message);
      }
    }
    return count;
  });

  const processedCount = insertMany(htmlFiles);
  console.log(
    `\n🎉 Successfully parsed and loaded ${processedCount} stories into SQLite!`,
  );
}

processHtmlFiles();
