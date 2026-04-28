// ─────────────────────────────────────────────────────────
// EndGit — Shared Types
// ─────────────────────────────────────────────────────────

// ── Plugin ────────────────────────────────────────────────

export type PluginType = "PYTHON" | "CPP" | "BOTH";
export type PluginStatus =
  | "DRAFT"
  | "BUILDING"
  | "BUILD_FAILED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FLAGGED"
  | "SUSPENDED";
export type QualityBadge = "NONE" | "EXPERIMENTAL" | "STABLE" | "VERIFIED";

export interface PluginSummary {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  tags: string[];
  pluginType: PluginType;
  downloads: number;
  stars: number;
  status: PluginStatus;
  qualityBadge: QualityBadge;
  isVerified: boolean;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  latestVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginDetail extends PluginSummary {
  longDescription: string | null;
  repoUrl: string | null;
  license: string | null;
  stabilityScore: number;
  trustScore: number;
  versions: VersionSummary[];
  averageRating: number;
  totalRatings: number;
}

export interface CreatePluginDto {
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  pluginType: PluginType;
  repoUrl?: string;
  license?: string;
  tags?: string[];
}

export interface UpdatePluginDto {
  displayName?: string;
  description?: string;
  longDescription?: string;
  iconUrl?: string;
  repoUrl?: string;
  license?: string;
  tags?: string[];
}

// ── Version ───────────────────────────────────────────────

export type VersionStatus =
  | "PENDING"
  | "AUTO_PASSED"
  | "SANDBOX_PASSED"
  | "APPROVED"
  | "REJECTED";

export interface VersionSummary {
  id: string;
  version: string;
  changelog: string | null;
  fileName: string;
  fileSize: number;
  downloads: number;
  isLatest: boolean;
  status: VersionStatus;
  createdAt: string;
}

export interface CreateVersionDto {
  version: string;
  changelog?: string;
  minApiVersion?: string;
  dependencies?: { name: string; version: string }[];
}

// ── User ──────────────────────────────────────────────────

export type TrustLevel = "NEW" | "TRUSTED" | "FLAGGED" | "ADMIN";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  trustLevel: TrustLevel;
  createdAt: string;
}

export interface DashboardStats {
  totalPlugins: number;
  totalDownloads: number;
  totalVersions: number;
  pendingReviews: number;
}

// ── Review ────────────────────────────────────────────────

export type ReviewDecision = "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
export type CheckTier = "TIER_1_AUTO" | "TIER_2_SANDBOX";
export type CheckStatus = "RUNNING" | "PASSED" | "FAILED" | "SKIPPED";
export type ReportReason =
  | "MALWARE"
  | "SPAM"
  | "COPIED"
  | "BROKEN"
  | "INAPPROPRIATE"
  | "OTHER";

export interface AutoCheckResult {
  id: string;
  tier: CheckTier;
  status: CheckStatus;
  structureOk: boolean | null;
  depsOk: boolean | null;
  semverOk: boolean | null;
  fileSizeOk: boolean | null;
  securityScanOk: boolean | null;
  sandboxLoadOk: boolean | null;
  sandboxCrashFree: boolean | null;
  score: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ReviewResult {
  id: string;
  decision: ReviewDecision;
  comment: string | null;
  codeClean: boolean | null;
  noBackdoor: boolean | null;
  rulesOk: boolean | null;
  reviewer: { username: string; avatarUrl: string | null };
  createdAt: string;
}

export interface RatingInfo {
  id: string;
  score: number;
  comment: string | null;
  user: { username: string; avatarUrl: string | null };
  createdAt: string;
}

// ── API Response ──────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
