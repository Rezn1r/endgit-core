// ─────────────────────────────────────────────────────────
// YAML Parser Tests
// Self-contained test file using simple assertions
// ─────────────────────────────────────────────────────────

import { parseYaml } from "../yaml-parser.ts";

function assertEqual(actual: any, expected: any, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`  PASS: ${message}`);
}

export function runTests(): void {
  console.log("YAML Parser Tests");
  console.log("─────────────────────────────────────────");

  // Test: Basic string values (quoted)
  {
    const result = parseYaml('name: "Hello"');
    assertEqual(result, { name: "Hello" }, "Basic quoted string value");
  }

  // Test: Unquoted strings
  {
    const result = parseYaml("visibility: public");
    assertEqual(result, { visibility: "public" }, "Unquoted string value");
  }

  // Test: Inline arrays
  {
    const result = parseYaml('branch: ["develop", "main"]');
    assertEqual(result, { branch: ["develop", "main"] }, "Inline array with quoted items");
  }

  // Test: Block arrays
  {
    const yaml = `branch:
  - develop
  - main`;
    const result = parseYaml(yaml);
    assertEqual(result, { branch: ["develop", "main"] }, "Block array with dash items");
  }

  // Test: Nested objects
  {
    const yaml = `build:
  command: "python setup.py build"
  output: "dist/"`;
    const result = parseYaml(yaml);
    assertEqual(result, { build: { command: "python setup.py build", output: "dist/" } }, "Nested object with string values");
  }

  // Test: Comments are ignored
  {
    const yaml = `# this is a comment
name: "Test"
# another comment
visibility: public`;
    const result = parseYaml(yaml);
    assertEqual(result, { name: "Test", visibility: "public" }, "Comments are ignored");
  }

  // Test: Empty input returns empty object
  {
    const result = parseYaml("");
    assertEqual(result, {}, "Empty input returns empty object");
  }

  // Test: Whitespace-only input returns empty object
  {
    const result = parseYaml("   \n\n   ");
    assertEqual(result, {}, "Whitespace-only input returns empty object");
  }

  // Test: Full example from feature request
  {
    const yaml = `name: "My Awesome Plugin"
icon: "https://example.com/icon.png"
branch: ["develop", "main"]
description: "A cool Endstone plugin"
visibility: public`;
    const result = parseYaml(yaml);
    assertEqual(result, {
      name: "My Awesome Plugin",
      icon: "https://example.com/icon.png",
      branch: ["develop", "main"],
      description: "A cool Endstone plugin",
      visibility: "public",
    }, "Full .endgit.yml example");
  }

  // Test: Single-quoted strings
  {
    const result = parseYaml("name: 'Hello World'");
    assertEqual(result, { name: "Hello World" }, "Single-quoted string value");
  }

  // Test: Multiple top-level keys
  {
    const yaml = `name: "Test"
description: "A description"
visibility: private`;
    const result = parseYaml(yaml);
    assertEqual(result, { name: "Test", description: "A description", visibility: "private" }, "Multiple top-level keys");
  }

  // Test: Inline array with single item
  {
    const result = parseYaml('branch: ["main"]');
    assertEqual(result, { branch: ["main"] }, "Inline array with single item");
  }

  // Test: Block array with comments between items
  {
    const yaml = `branch:
  - develop
  # this is between items
  - main`;
    const result = parseYaml(yaml);
    assertEqual(result, { branch: ["develop", "main"] }, "Block array with comments between items");
  }

  // Test: Block scalar indicator is skipped (multi-line string)
  {
    const yaml = `name: "My Plugin"
description: |
  This is a multi-line
  description block
visibility: public`;
    const result = parseYaml(yaml);
    assertEqual(result, { name: "My Plugin", visibility: "public" }, "Block scalar indicator (|) causes key to be omitted");
  }

  // Test: Flow mapping value is skipped
  {
    const yaml = `name: "My Plugin"
build: {command: "make", output: "dist/"}
visibility: private`;
    const result = parseYaml(yaml);
    assertEqual(result, { name: "My Plugin", visibility: "private" }, "Flow mapping value ({...}) causes key to be omitted");
  }

  console.log("\n─────────────────────────────────────────");
  console.log("All YAML parser tests passed!");
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
