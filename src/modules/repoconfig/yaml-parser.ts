// ─────────────────────────────────────────────────────────
// Lightweight YAML Parser for .endgit.yml
// Supports: string values, inline/block arrays, one-level nested objects, comments
// ─────────────────────────────────────────────────────────

/**
 * Parse a simple YAML string into a key-value record.
 * Supports the subset of YAML used by .endgit.yml config files.
 */
export function parseYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.trimStart().startsWith("#")) {
      i++;
      continue;
    }

    // Determine indentation level
    const indent = line.length - line.trimStart().length;

    // Only process top-level keys (no indentation)
    if (indent > 0) {
      i++;
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    if (rawValue === "") {
      // Could be a nested object or block array - peek at next lines
      const nested = parseNestedBlock(lines, i + 1);
      if (nested.type === "array") {
        result[key] = nested.value;
      } else if (nested.type === "object") {
        result[key] = nested.value;
      }
      i = nested.nextIndex;
    } else if (rawValue.startsWith("[")) {
      // Inline array: [item1, item2]
      result[key] = parseInlineArray(rawValue);
      i++;
    } else {
      // Simple string value
      result[key] = parseStringValue(rawValue);
      i++;
    }
  }

  return result;
}

function parseNestedBlock(lines: string[], startIndex: number): { type: "array" | "object"; value: any; nextIndex: number } {
  const items: string[] = [];
  const obj: Record<string, any> = {};
  let isArray = false;
  let isObject = false;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty lines and comments within the block
    if (trimmed === "" || trimmed.trimStart().startsWith("#")) {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // If no indentation, we've left the nested block
    if (indent === 0) {
      break;
    }

    const content = trimmed.trimStart();

    if (content.startsWith("- ")) {
      // Block array item
      isArray = true;
      const itemValue = parseStringValue(content.slice(2).trim());
      items.push(itemValue);
    } else if (content.includes(":")) {
      // Nested object key-value
      isObject = true;
      const colonIdx = content.indexOf(":");
      const nestedKey = content.slice(0, colonIdx).trim();
      const nestedVal = content.slice(colonIdx + 1).trim();
      obj[nestedKey] = parseStringValue(nestedVal);
    }

    i++;
  }

  if (isArray) {
    return { type: "array", value: items, nextIndex: i };
  }
  return { type: "object", value: obj, nextIndex: i };
}

function parseInlineArray(raw: string): string[] {
  // Remove surrounding brackets
  const inner = raw.slice(1, raw.lastIndexOf("]")).trim();
  if (inner === "") return [];

  const items: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];

    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      inQuote = false;
    } else if (!inQuote && ch === ",") {
      items.push(parseStringValue(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim() !== "") {
    items.push(parseStringValue(current.trim()));
  }

  return items;
}

function parseStringValue(raw: string): string {
  if (raw === "") return "";

  // Remove surrounding quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  // Strip inline comments (only if there's a space before #)
  const commentIndex = raw.indexOf(" #");
  if (commentIndex !== -1) {
    raw = raw.slice(0, commentIndex).trim();
  }

  return raw;
}
