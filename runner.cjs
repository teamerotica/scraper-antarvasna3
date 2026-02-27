const { spawn } = require("child_process");

// Capture any arguments passed to the runner (like --urls patch.txt, --force, or --skip-crawling)
const args = process.argv.slice(2);
const skipCrawling = args.includes("--skip-crawling");

function runCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, commandArgs, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function runAll() {
  console.log("🚀 Firing up the Armored Pipeline...\n");
  if (args.length > 0) {
    console.log(`🛠️  Passing CLI arguments: ${args.join(" ")}`);
  }

  try {
    if (skipCrawling) {
      console.log("\n======================================================");
      console.log("⏭️  [PHASE 0 SKIPPED] --skip-crawling flag detected.");
      console.log("======================================================");
      console.log(
        "Proceeding directly to Phase 1 with existing raw_html/ files...",
      );
    } else {
      console.log("\n======================================================");
      console.log("▶ [PHASE 0] Starting the Armored Fetcher (Puppeteer)");
      console.log("======================================================");
      await runCommand("node", ["phase0.cjs", ...args]);
    }

    console.log("\n======================================================");
    console.log("▶ [PHASE 1] Parsing HTML and Loading SQLite DB");
    console.log("======================================================");
    await runCommand("node", ["phase1.cjs"]);

    console.log("\n======================================================");
    console.log("▶ [PHASE 2] Exporting Database to Normalized JSON");
    console.log("======================================================");
    await runCommand("node", ["phase2.cjs"]);

    console.log("\n🎉 ALL PHASES COMPLETED! The tank can rest.");
  } catch (error) {
    console.error("\n❌ Pipeline halted due to critical error:", error.message);
  }
}

runAll();
