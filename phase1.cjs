const fs = require("fs-extra");
const path = require("path");
const Database = require("better-sqlite3");
const parse = require("./parse.cjs");

// 1. Initialize DB
const db = new Database("scraped_data.db");

// 2. Create Table
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
    content TEXT,
    source_file TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_slug ON stories(slug);
  CREATE INDEX IF NOT EXISTS idx_source_file ON stories(source_file);
`);

// 3. Prepared statements
const checkFileStmt = db.prepare(
  `SELECT id FROM stories WHERE source_file = ?`,
);
const checkSlugStmt = db.prepare(`SELECT id FROM stories WHERE slug = ?`);

// Removed 'OR IGNORE' because we will guarantee unique slugs manually
const insertStoryStmt = db.prepare(`
  INSERT INTO stories (slug, title, author, excerpt, genre, readingTime, createdAt, wordCount, content, source_file)
  VALUES (@slug, @title, @author, @excerpt, @genre, @readingTime, @createdAt, @wordCount, @content, @source_file)
`);

// Safe to use now because source_file prevents identical files from looping!
function getUniqueSlug(baseSlug) {
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

  console.log(`\n📂 Found ${htmlFiles.length} HTML files total in raw_html/`);

  // Filter out the files that are already safely inside SQLite
  const pendingFiles = htmlFiles.filter((file) => {
    const exists = checkFileStmt.get(file);
    return !exists;
  });

  console.log(
    `📊 ${htmlFiles.length - pendingFiles.length} already in DB. ${pendingFiles.length} new files pending to parse...\n`,
  );

  if (pendingFiles.length === 0) {
    return console.log("🎉 Database is fully up to date! Nothing to patch.");
  }

  const insertMany = db.transaction((filesList) => {
    let count = 0;
    for (const file of filesList) {
      const htmlContent = fs.readFileSync(path.join(inputDir, file), "utf-8");
      const data = parse(htmlContent, file);

      if (!data) continue;

      const safeSlug = getUniqueSlug(data.slug);

      try {
        const info = insertStoryStmt.run({
          slug: safeSlug,
          title: data.frontmatter.title,
          author: data.frontmatter.author,
          excerpt: data.frontmatter.excerpt,
          genre: data.frontmatter.genre.slug,
          readingTime: data.frontmatter.reading_time,
          createdAt: data.frontmatter.created_at,
          wordCount: data.frontmatter.word_count,
          content: data.content,
          source_file: file,
        });

        // Actually check if SQLite inserted the row
        if (info.changes > 0) {
          count++;
          console.log(`  ✔ Inserted: ${safeSlug}`);
        }
      } catch (err) {
        console.error(
          `  ✖ DB Error on ${safeSlug} (File: ${file}):`,
          err.message,
        );
      }
    }
    return count;
  });

  const processedCount = insertMany(pendingFiles);
  console.log(
    `\n🎉 Successfully patched and loaded ${processedCount} new stories into SQLite!`,
  );
}

processHtmlFiles();
