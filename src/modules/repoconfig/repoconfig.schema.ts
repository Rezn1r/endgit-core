// ─────────────────────────────────────────────────────────
// EndGit Repo Config — Schema & Validation
// ─────────────────────────────────────────────────────────

export interface EndGitBuildConfig {
  command?: string;
  output?: string;
}

export interface EndGitRepoConfig {
  name?: string;
  icon?: string;
  branch?: string | string[];
  description?: string;
  visibility?: "public" | "private";
  build?: EndGitBuildConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEndGitConfig(config: Record<string, any>): ValidationResult {
  const errors: string[] = [];

  if (config.name !== undefined) {
    if (typeof config.name !== "string") {
      errors.push("name must be a string");
    } else if (config.name.length > 100) {
      errors.push("name must be 100 characters or fewer");
    }
  }

  if (config.icon !== undefined) {
    if (typeof config.icon !== "string") {
      errors.push("icon must be a string");
    } else if (!config.icon.startsWith("https://")) {
      errors.push("icon must be a valid HTTPS URL (must start with https://)");
    }
  }

  if (config.branch !== undefined) {
    if (Array.isArray(config.branch)) {
      for (const b of config.branch) {
        if (typeof b !== "string") {
          errors.push("branch array items must be strings");
          break;
        }
      }
    } else if (typeof config.branch !== "string") {
      errors.push("branch must be a string or array of strings");
    }
  }

  if (config.description !== undefined) {
    if (typeof config.description !== "string") {
      errors.push("description must be a string");
    } else if (config.description.length > 500) {
      errors.push("description must be 500 characters or fewer");
    }
  }

  if (config.visibility !== undefined) {
    if (config.visibility !== "public" && config.visibility !== "private") {
      errors.push("visibility must be 'public' or 'private'");
    }
  }

  if (config.build !== undefined) {
    if (typeof config.build !== "object" || config.build === null || Array.isArray(config.build)) {
      errors.push("build must be an object");
    } else {
      if (config.build.command !== undefined && typeof config.build.command !== "string") {
        errors.push("build.command must be a string");
      }
      if (config.build.output !== undefined && typeof config.build.output !== "string") {
        errors.push("build.output must be a string");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
