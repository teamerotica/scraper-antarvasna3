# 🛡️ The Armored Scraper: Heavy-Duty ETL Pipeline

A robust, fault-tolerant Node.js web scraping and data normalization pipeline. Built to punch through aggressive anti-bot protections (Cloudflare), parse raw HTML into clean Markdown, and export perfectly normalized, paginated JSON ready for a zero-latency **Astro SSG** frontend.

Say goodbye to messy `wget` hairballs and heavy ORMs. This is a lightning-fast, C++ backed data extraction engine.

## ✨ System Architecture

This pipeline is decoupled into three distinct, highly optimized phases to ensure maximum stability and speed:

### ▶️ Phase 0: The Armored Fetcher (`phase0.cjs`)

* **The Mission:** Penetrate Cloudflare defenses and download raw HTML.
* **The Tools:** Puppeteer (Headless Chrome) configured with stealth arguments and human-like viewports.
* **The Feature:** Bulletproof resumability. It reads targets from `urls.txt`, logs successes to `urls_history.log`, and gracefully handles timeouts. If it crashes, it resumes exactly where it left off.

### ▶️ Phase 1: The SQLite Engine (`phase1.cjs`)

* **The Mission:** Parse the raw HTML, convert it to clean Markdown, and load it into a fast local database.
* **The Tools:** `cheerio`, `turndown`, and `better-sqlite3`.
* **The Feature:** Replaces heavy ORMs like Prisma. It generates unique slugs on the fly, cleans up DOM bloat, and inserts thousands of records per second into a local `scraped_data.db` using synchronous SQLite transactions.
* *(Note: Legacy HTML files can be manually dropped into the `raw_html/` folder, and this engine will happily process them!)*

### ▶️ Phase 2: The JSON Normalizer (`phase2.cjs`)

* **The Mission:** Query the SQLite database and export normalized JSON files matching a strict schema.
* **The Feature:** Generates a global "Latest" index and individual "Genre" indexes, automatically paginating everything at 70 stories per page. It outputs lightweight index arrays for routing and heavyweight Markdown JSONs for content generation.

---

## 📂 Directory Structure

```text
├── parse.cjs            # Core logic: DOM cleaning and HTML-to-Markdown conversion
├── phase0.cjs           # Puppeteer extraction (saves to raw_html/)
├── phase1.cjs           # SQLite database loader
├── phase2.cjs           # Normalized JSON exporter
├── runner.cjs           # Master orchestrator (runs phases sequentially)
├── urls.txt             # Your blueprint: The manual list of target URLs
├── .gitignore           # Keeps the repo clean of heavy DB and HTML files
├── raw_html/            # (Generated) Raw source code downloaded by Phase 0
├── scraped_data.db      # (Generated) The lightning-fast local SQLite database
└── out/                 # (Generated) The final JSON payload for the Astro SSG
    ├── latest/pages/    # Global paginated indexes
    ├── genres/          # Category-specific paginated indexes
    └── stories/         # The individual, full-content Markdown JSON files

```

---

## 🚀 Getting Started

### 1. Installation

Clone the repository and install the heavy-duty dependencies:

```bash
npm install puppeteer fs-extra cheerio better-sqlite3 turndown
```

### 2. Prepare Your Targets

Add your target URLs to `urls.txt` (one URL per line).

*(Optional: If you have old `wget` HTML backups, drop them directly into the `raw_html/` folder!)*

### 3. Deploy the Tank

To run the entire end-to-end pipeline safely, use the orchestrator:

```bash
node runner.cjs
```

*(For massive, multi-day server runs, use `pm2 start runner.cjs --name "armored-scraper"`)*

---

## 🏗️ The Astro Endgame

The ultimate goal of this pipeline is to feed a static site generator. The generated `out/` folder is designed to be dropped directly into an Astro project. Using Astro's `getStaticPaths()`, the frontend can rip through these local JSON files at build time, generating tens of thousands of static HTML pages with zero database queries, zero server-side latency, and zero hosting costs.

**Data shape output:**

```json
{
  "id": "my-unique-slug",
  "title": "Story Title",
  "link": "/story/my-unique-slug",
  "author": "Author Name",
  "description": "Excerpt here...",
  "rating": "N/A",
  "reads": 0,
  "posted": "Tue Feb 17 2026",
  "posted_iso": "2026-02-17T16:00:00.000Z",
  "tags": ["genre-slug"],
  "content": "Clean markdown string here..."
}
```