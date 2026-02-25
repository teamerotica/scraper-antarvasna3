const { spawn } = require("child_process");

// Capture any arguments passed to the runner (like --urls patch.txt or --force)
const args = process.argv.slice(2);

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
    console.log(`🛠️  Passing arguments to Phase 0: ${args.join(" ")}`);
  }

  try {
    console.log("\n======================================================");
    console.log("▶ [PHASE 0] Starting the Armored Fetcher (Puppeteer)");
    console.log("======================================================");
    // Notice we spread the ...args here so phase0 gets them!
    await runCommand("node", ["phase0.cjs", ...args]);

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
