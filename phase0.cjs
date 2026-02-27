const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const readline = require("readline/promises"); // <-- Bring in the interactive prompt

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

  // 1. Parse Command Line Arguments
  const args = process.argv.slice(2);
  const isForce = args.includes("--force");
  const isBypass = args.includes("--yes-i-know-what-i-am-doing"); // Backdoor for PM2 automation

  // Look for --urls flag and grab the next argument as the filename
  let urlFile = "urls.txt";
  const urlsIndex = args.indexOf("--urls");
  if (urlsIndex !== -1 && args.length > urlsIndex + 1) {
    urlFile = args[urlsIndex + 1];
  }

  // ==========================================
  // 🚨 THE THREE-STRIKE SAFETY PROTOCOL
  // ==========================================
  if (urlFile === "urls.txt" && !isBypass) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n======================================================");
    console.log("  ⚠️  WARNING 1/3: MASSIVE CRAWL DETECTED");
    console.log("======================================================");
    console.log("You are about to run against the master 'urls.txt' list.");
    console.log("This is a heavy operation meant for one-time initialization.");
    const ans1 = await rl.question("Are you sure you want to proceed? (y/n): ");
    if (ans1.toLowerCase() !== "y") {
      console.log("Aborting. Use '--urls patch.txt' for routine updates.");
      process.exit(0);
    }

    console.log("\n  ☢️  WARNING 2/3: SERVER IMPACT");
    console.log("Crawling the entire site again could lead to IP bans.");
    const ans2 = await rl.question(
      "Type 'yes' to confirm you want to do this: ",
    );
    if (ans2.toLowerCase() !== "yes") {
      console.log("Aborting. Stay safe out there.");
      process.exit(0);
    }

    console.log("\n  💀 WARNING 3/3: FINAL CONFIRMATION");
    const ans3 = await rl.question("Type 'DO IT' to unlock the tank: ");
    if (ans3 !== "DO IT") {
      console.log("Aborting. Smart choice.");
      process.exit(0);
    }

    rl.close();
    console.log("\n🔓 Safety disengaged. Loading armor...");
  }

  const history = await loadHistory();
  const existingFiles = new Set(await fs.readdir("raw_html").catch(() => []));

  // 2. Safely read the specified URL file
  let allUrls = [];
  try {
    allUrls = (await fs.readFile(urlFile, "utf-8"))
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
  } catch (err) {
    console.error(
      `\n❌ Fatal Error: Could not read file "${urlFile}". Does it exist?`,
    );
    return;
  }

  // 3. Filter the URLs
  const pendingUrls = allUrls.filter((url) => {
    if (isForce) return true;
    if (history.has(url)) return false;
    const filename = getFilenameFromUrl(url);
    if (existingFiles.has(filename)) return false;
    return true;
  });

  console.log(`\n📂 Target File: ${urlFile}`);
  if (isForce) {
    console.log("⚠️  --force flag detected! Bypassing history checks.");
  }
  console.log(
    `📊 Found ${allUrls.length} total URLs. ${allUrls.length - pendingUrls.length} already done/exist. ${pendingUrls.length} pending.\n`,
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

    console.log(`🚀 Starting crawl with ${concurrency} workers...\n`);
    await Promise.all(
      chunks.map((chunk, index) => processChunk(chunk, browser, index + 1)),
    );

    console.log("\n✅ Crawl batch complete!");
  } finally {
    await browser.close();
  }
}

crawl(4);
