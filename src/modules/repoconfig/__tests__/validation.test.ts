// ─────────────────────────────────────────────────────────
// Config Validation Tests
// Self-contained test file using simple assertions
// ─────────────────────────────────────────────────────────

import { validateEndGitConfig } from "../repoconfig.schema.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertValid(config: Record<string, any>, message: string): void {
  const result = validateEndGitConfig(config);
  if (!result.valid) {
    throw new Error(`FAIL: ${message} - expected valid but got errors: ${result.errors.join(", ")}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertInvalid(config: Record<string, any>, expectedError: string, message: string): void {
  const result = validateEndGitConfig(config);
  if (result.valid) {
    throw new Error(`FAIL: ${message} - expected invalid but got valid`);
  }
  const hasError = result.errors.some(e => e.toLowerCase().includes(expectedError.toLowerCase()));
  if (!hasError) {
    throw new Error(`FAIL: ${message} - expected error containing "${expectedError}" but got: ${result.errors.join(", ")}`);
  }
  console.log(`  PASS: ${message}`);
}

export function runTests(): void {
  console.log("Config Validation Tests");
  console.log("─────────────────────────────────────────");

  // Test: Valid config passes (all fields correct)
  {
    const config = {
      name: "My Plugin",
      icon: "https://example.com/icon.png",
      branch: ["develop", "main"],
      description: "A cool plugin",
      visibility: "public",
      build: { command: "python setup.py build", output: "dist/" },
    };
    assertValid(config, "Valid config with all fields passes");
  }

  // Test: Empty config passes (all fields optional)
  {
    assertValid({}, "Empty config passes (all fields optional)");
  }

  // Test: Invalid icon (not https://) fails
  {
    const config = { icon: "http://example.com/icon.png" };
    assertInvalid(config, "https", "Invalid icon (http:// instead of https://) fails");
  }

  // Test: Invalid icon (not a URL at all) fails
  {
    const config = { icon: "not-a-url" };
    assertInvalid(config, "https", "Invalid icon (not a URL) fails");
  }

  // Test: name too long (>100 chars) fails
  {
    const config = { name: "a".repeat(101) };
    assertInvalid(config, "100", "name too long (101 chars) fails");
  }

  // Test: name at max length passes
  {
    const config = { name: "a".repeat(100) };
    assertValid(config, "name at exactly 100 chars passes");
  }

  // Test: description too long (>500 chars) fails
  {
    const config = { description: "a".repeat(501) };
    assertInvalid(config, "500", "description too long (501 chars) fails");
  }

  // Test: description at max length passes
  {
    const config = { description: "a".repeat(500) };
    assertValid(config, "description at exactly 500 chars passes");
  }

  // Test: Invalid visibility value fails
  {
    const config = { visibility: "unlisted" };
    assertInvalid(config, "visibility", "Invalid visibility value fails");
  }

  // Test: Valid visibility values pass
  {
    assertValid({ visibility: "public" }, "visibility 'public' passes");
    assertValid({ visibility: "private" }, "visibility 'private' passes");
  }

  // Test: Invalid branch type (number) fails
  {
    const config = { branch: 123 };
    assertInvalid(config, "branch", "Invalid branch type (number) fails");
  }

  // Test: branch as string passes
  {
    assertValid({ branch: "main" }, "branch as string passes");
  }

  // Test: branch as array of strings passes
  {
    assertValid({ branch: ["main", "develop"] }, "branch as array of strings passes");
  }

  // Test: Invalid build (non-object) fails
  {
    const config = { build: "npm run build" };
    assertInvalid(config, "build must be an object", "Invalid build (string) fails");
  }

  // Test: Invalid build (array) fails
  {
    const config = { build: ["npm", "run", "build"] };
    assertInvalid(config, "build must be an object", "Invalid build (array) fails");
  }

  // Test: Invalid build (null) fails
  {
    const config = { build: null };
    assertInvalid(config, "build must be an object", "Invalid build (null) fails");
  }

  // Test: build.command as non-string fails
  {
    const config = { build: { command: 123 } };
    assertInvalid(config, "build.command", "build.command as number fails");
  }

  // Test: build.output as non-string fails
  {
    const config = { build: { output: false } };
    assertInvalid(config, "build.output", "build.output as boolean fails");
  }

  // Test: Valid build object passes
  {
    assertValid({ build: { command: "make", output: "dist/" } }, "Valid build object passes");
    assertValid({ build: {} }, "Empty build object passes");
  }

  // Test: name as non-string fails
  {
    const config = { name: 42 };
    assertInvalid(config, "name must be a string", "name as number fails");
  }

  // Test: icon as non-string fails
  {
    const config = { icon: 42 };
    assertInvalid(config, "icon must be a string", "icon as number fails");
  }

  // Test: description as non-string fails
  {
    const config = { description: true };
    assertInvalid(config, "description must be a string", "description as boolean fails");
  }

  console.log("\n─────────────────────────────────────────");
  console.log("All validation tests passed!");
}

// Auto-run if executed directly
const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  runTests();
}

// Also auto-run in ESM mode (when import.meta is available)
if (typeof require === "undefined") {
  runTests();
}
