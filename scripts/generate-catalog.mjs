import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const testTitlePattern = /^test\(("(?:\\.|[^"\\])*")\s*,/gm;

export async function collectAutomatedTests(root = repositoryRoot) {
  const testDirectory = new URL("test/", pathToDirectoryUrl(root));
  const files = (await readdir(testDirectory))
    .filter((file) => file.endsWith(".test.js"))
    .sort((left, right) => left.localeCompare(right));
  const tests = [];

  for (const file of files) {
    const source = await readFile(new URL(file, testDirectory), "utf8");
    for (const match of source.matchAll(testTitlePattern)) {
      tests.push({ file: `test/${file}`, title: JSON.parse(match[1]) });
    }
  }
  return tests;
}

export function renderTestCatalog(tests) {
  const lines = [
    "# Tests",
    "",
    "This is the complete human-readable catalog of Crimson Dawn's automated tests.",
    "The executable sources remain in `test/` and run with `npm test`; keeping them",
    "separate preserves readable, maintainable test code while this root file gives",
    "GitHub visitors one place to see everything that is checked.",
    "",
    "Do not edit the generated test entries by hand. Run `npm run tests:catalog` after",
    "adding, removing, or renaming a test. `npm test` and `npm run check` both fail when",
    "this catalog is out of date.",
    "",
    `**Automated tests documented:** ${tests.length}`,
    "",
  ];
  let currentFile = null;
  let fileIndex = 0;

  for (const test of tests) {
    if (test.file !== currentFile) {
      currentFile = test.file;
      fileIndex = 0;
      lines.push(`## [${test.file}](${test.file})`, "");
    }
    fileIndex += 1;
    const key = JSON.stringify([test.file, test.title]);
    lines.push(
      `<!-- test-catalog-entry: ${key} -->`,
      `### ${fileIndex}. ${test.title}`,
      "",
      `**What it checks:** ${testExplanation(test)}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function testExplanation(test) {
  if (test.file === "test/test-catalog.test.js") {
    return "Reads every executable test title and verifies that this root catalog lists each one with an explanation.";
  }
  const contextByFile = {
    "test/bootstrap.test.js": "Inspects the browser entry point and interface wiring to confirm that",
    "test/determinism.test.js": "Runs deterministic command and snapshot checks to confirm that",
    "test/multiplayer.test.js": "Exercises lobby and peer-session behavior to confirm that",
    "test/network-presentation.test.js": "Exercises remote-position smoothing to confirm that",
    "test/queue-status.test.js": "Builds queue status summaries to confirm that",
    "test/simulation-clock.test.js": "Advances the authoritative clock to confirm that",
    "test/simulation.test.js": "Runs the deterministic game simulation to confirm that",
    "test/strategic-view.test.js": "Calculates strategic-view presentation data to confirm that",
  };
  const context = contextByFile[test.file] || "Runs the automated suite to confirm that";
  const statement = test.title.replace(/[.!?]+$/, "");
  return `${context} ${statement}.`;
}

function pathToDirectoryUrl(path) {
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return pathToFileURL(normalized);
}

async function main() {
  const tests = await collectAutomatedTests();
  const rendered = renderTestCatalog(tests);
  const catalogUrl = new URL("TESTS.md", pathToDirectoryUrl(repositoryRoot));
  if (process.argv.includes("--check")) {
    const existing = await readFile(catalogUrl, "utf8").catch(() => "");
    if (existing !== rendered) {
      throw new Error("TESTS.md is out of date. Run `npm run tests:catalog`.");
    }
    return;
  }
  await writeFile(catalogUrl, rendered);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
