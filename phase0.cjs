const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");

const HISTORY_FILE = "urls_history.log";

// Helper function to keep our filename generation consistent
function getFilenameFromUrl(url) {
  try {
    // 1. Grab the last segment of the URL and strip query parameters
    let rawSegment = url.split("/").filter(Boolean).pop().replace(/\?.*$/, "");

    // 2. Decode any weird URL characters (like %20 to spaces)
    let decodedSegment = decodeURIComponent(rawSegment).toLowerCase();

    // 3. Strip .html if it already exists in the URL so we don't get double .html.html
    if (decodedSegment.endsWith(".html")) {
      decodedSegment = decodedSegment.replace(".html", "");
    }

    // 4. Return the clean filename
    return decodedSegment + ".html";
  } catch (err) {
    // Fallback just in case decoding fails on a weird URL
    return (
      url.split("/").filter(Boolean).pop().replace(/\?.*$/, "").toLowerCase() +
      ".html"
    );
  }
}

async function loadHistory() {
  await fs.ensureFile(HISTORY_FILE);
  const data = await fs.readFile(HISTORY_FILE, "utf-8");
  return new Set(
    data
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

async function crawlUrl(url, browser) {
  let page;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(45000);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (
        ["image", "stylesheet", "font", "media"].includes(
          request.resourceType(),
        )
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.antarvasna3.com",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    const title = await page.title();
    if (title === "Just a moment...") {
      console.log(`  🛡️ Cloudflare detected on ${url}, waiting...`);
      await page.mouse.move(100, 100);
      await new Promise((resolve) => setTimeout(resolve, 6000));
      const newTitle = await page.title();
      if (newTitle === "Just a moment...")
        throw new Error("Cloudflare blocked");
    }

    const html = await page.content();
    const filename = getFilenameFromUrl(url);

    await fs.writeFile(path.join("raw_html", filename), html);
    await fs.appendFile(HISTORY_FILE, `${url}\n`); // Log success immediately
    console.log(`  ✅ Success: ${filename}`);
    return true;
  } finally {
    if (page) await page.close();
  }
}

async function processChunk(urls, browser, chunkIndex) {
  for (const url of urls) {
    console.log(`[Worker ${chunkIndex}] Crawling: ${url}`);
    try {
      await crawlUrl(url, browser);
      // Nice delay to prevent instant IP ban
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(
        `[Worker ${chunkIndex}] ❌ Error: ${url} | ${error.message}`,
      );
      await fs.appendFile("phase0_errors.log", `${url} | ${error.message}\n`);
    }
  }
}

async function crawl(concurrency = 4) {
  await fs.ensureDir("raw_html");

  // 1. Check for the --force flag in the terminal command
  const isForce = process.argv.includes("--force");

  const history = await loadHistory();
  // Read existing files in the directory so we can cross-reference
  const existingFiles = new Set(await fs.readdir("raw_html").catch(() => []));

  const allUrls = (await fs.readFile("urls.txt", "utf-8"))
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);

  // 2. Filter the URLs based on history, existing files, and the --force flag
  const pendingUrls = allUrls.filter((url) => {
    if (isForce) return true; // Scrape everything if --force is used

    if (history.has(url)) return false; // Skip if in log

    const filename = getFilenameFromUrl(url);
    if (existingFiles.has(filename)) return false; // Skip if file already exists manually

    return true; // Keep if neither condition met
  });

  if (isForce) {
    console.log(
      "⚠️  --force flag detected! Ignoring history and raw_html files. Scraping everything.",
    );
  }

  console.log(
    `Found ${allUrls.length} total URLs. ${allUrls.length - pendingUrls.length} already done/exist. ${pendingUrls.length} pending.`,
  );
  if (pendingUrls.length === 0) return console.log("🎉 All URLs processed!");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-accelerated-2d-canvas",
      "--window-size=1920,1080",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ],
  });

  try {
    const chunkSize = Math.ceil(pendingUrls.length / concurrency);
    const chunks = Array.from({ length: concurrency }, (_, i) =>
      pendingUrls.slice(i * chunkSize, (i + 1) * chunkSize),
    );

    console.log(`Starting crawl with ${concurrency} workers...\n`);
    await Promise.all(
      chunks.map((chunk, index) => processChunk(chunk, browser, index + 1)),
    );

    console.log("\n✅ Crawl batch complete!");
  } finally {
    await browser.close();
  }
}

crawl(4);
