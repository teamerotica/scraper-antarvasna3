const { spawn } = require("child_process");

// Helper function to run a terminal command and pipe the output to your screen
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    // stdio: "inherit" ensures you see all the live console logs
    const proc = spawn(command, args, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

// The Master Pipeline
async function runAll() {
  console.log("🚀 Firing up the Armored Pipeline...\n");

  try {
    console.log("======================================================");
    console.log("▶ [PHASE 0] Starting the Armored Fetcher (Puppeteer)");
    console.log("======================================================");
    await runCommand("node", ["phase0.cjs"]);

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
