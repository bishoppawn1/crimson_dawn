import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectAutomatedTests,
  renderTestCatalog,
} from "../scripts/generate-catalog.mjs";

test("TESTS.md lists every automated test with an explanation", async () => {
  const tests = await collectAutomatedTests();
  const catalog = await readFile(new URL("../TESTS.md", import.meta.url), "utf8");

  assert.equal(catalog, renderTestCatalog(tests));
});
