// batch_main.js
// Usage: node batch_main.js

const { exec } = require('child_process');

// 🧩 Configuration
const scripts = [
  'main.js',
];
const totalRunsPerScript = 10;
const timeoutMs = 10 * 60 * 1000; // 10 minutes
const delayBetweenRuns = 2000; // 2 seconds

let currentScriptIndex = 0;
let currentRun = 0;

console.log(`🚀 Starting batch sequence — each script will run ${totalRunsPerScript} times.\n`);

function runScript() {
  const script = scripts[currentScriptIndex];

  if (!script) {
    console.log(`✅ All scripts completed successfully. Exiting.`);
    process.exit(0);
  }

  if (currentRun >= totalRunsPerScript) {
    console.log(`🏁 Finished all ${totalRunsPerScript} runs for ${script}. Moving to next script...\n`);
    currentRun = 0;
    currentScriptIndex++;
    return setTimeout(runScript, 3000); // short pause before next script
  }

  currentRun++;
  console.log(`\n⚙️  [${script}] Run ${currentRun} of ${totalRunsPerScript} starting...`);

  const startTime = Date.now();
  const processInstance = exec(`node ${script}`, { timeout: timeoutMs });

  processInstance.stdout.on('data', (data) => process.stdout.write(data));
  processInstance.stderr.on('data', (data) => process.stderr.write(data));

  processInstance.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (code === 0) {
      console.log(`✅ [${script}] Run ${currentRun} completed successfully in ${duration}s.`);
    } else {
      console.warn(`⚠️ [${script}] Run ${currentRun} failed (exit code ${code}). Continuing...`);
    }

    setTimeout(runScript, delayBetweenRuns);
  });

  processInstance.on('error', (err) => {
    console.error(`❌ [${script}] Unexpected error on run ${currentRun}: ${err.message}`);
    setTimeout(runScript, delayBetweenRuns);
  });
}

// Start execution chain
runScript();
