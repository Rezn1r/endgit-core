/**
 * EndGit Discord Webhook Utilities
 * Provides rich notifications for marketplace events.
 */

const CONFIG = {
  BASE_URL: "https://endgit.dev",
  LOGO_URL: "https://endgit.dev/logo.png",
  COLORS: {
    INFO: 0x38BDF8,      // Cyan (Approved)
    SUCCESS: 0x2ECC71,   // Green (Submitted)
    WARNING: 0xFFDB58,   // Yellow (Rating)
    DANGER: 0xEF4444,    // Red (Rejected/Flagged)
    NEUTRAL: 0x94A3B8,   // Slate
  }
};

type DiscordEmbed = {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  timestamp?: string;
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
};

type DiscordWebhookBody = {
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
};

/**
 * Generic helper to send a Discord webhook with consistent styling and error handling.
 */
async function sendWebhook(url: string, body: DiscordWebhookBody) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: body.username || "EndGit Marketplace",
        avatar_url: body.avatar_url || CONFIG.LOGO_URL,
        ...body,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Discord webhook failed (${response.status}): ${text}`);
    }
  } catch (error) {
    console.error("Failed to send Discord webhook:", error);
  }
}

/**
 * Formats a numeric score into a visual star representation.
 */
function formatStars(score: number): string {
  const fullStar = "⭐";
  const emptyStar = "☆";
  const clampedScore = Math.max(0, Math.min(5, Math.floor(score)));
  return fullStar.repeat(clampedScore) + emptyStar.repeat(5 - clampedScore);
}

/**
 * Notification for when a plugin version is approved and released.
 */
export async function sendPluginApprovedWebhook(plugin: any, version: any, reviewerUsername: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const category = plugin.tags?.[0] || "General";
  const pluginUrl = `${CONFIG.BASE_URL}/plugins/${plugin.slug}?v=${version.version}`;

  // Format author list from producers or default to the plugin author
  const authorStr = version.producers?.length > 0
    ? version.producers.map((p: any) => p.githubUser).join(", ")
    : plugin.author?.username || "Unknown";

  const description = [
    `**Category**: ${category}`,
    `**Author**: ${authorStr}`,
    `**Reviewer**: @${reviewerUsername}`,
    "",
    plugin.description || "A plugin for Endstone",
    "",
    `**Release Notes**: ${version.changelog || "No notes provided."}`
  ].join("\n");

  const embed: DiscordEmbed = {
    title: `${plugin.displayName} v${version.version}`,
    url: pluginUrl,
    description,
    color: CONFIG.COLORS.INFO,
    timestamp: new Date().toISOString(),
    thumbnail: plugin.iconUrl ? { url: plugin.iconUrl } : undefined,
    footer: { text: "EndGit Release Pipeline", icon_url: CONFIG.LOGO_URL }
  };

  await sendWebhook(webhookUrl, {
    username: "Plugin Updates",
    embeds: [embed]
  });
}

/**
 * Notification for new user reviews and ratings.
 */
export async function sendNewRatingWebhook(plugin: any, rating: any, reviewerName: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_NEW_RATING;
  if (!webhookUrl) return;

  const pluginUrl = `${CONFIG.BASE_URL}/plugins/${plugin.slug}`;
  const stars = formatStars(rating.score);

  const description = [
    `**Rating**: ${stars} (${rating.score}/5)`,
    `**User**: ${reviewerName}`,
    "",
    rating.comment ? `"${rating.comment}"` : "*No comment provided.*"
  ].join("\n");

  const embed: DiscordEmbed = {
    title: `New Review: ${plugin.displayName || plugin.name}`,
    url: pluginUrl,
    description,
    color: CONFIG.COLORS.WARNING,
    timestamp: new Date().toISOString(),
    thumbnail: plugin.iconUrl ? { url: plugin.iconUrl } : undefined,
    footer: { text: "EndGit User Feedback", icon_url: CONFIG.LOGO_URL }
  };

  await sendWebhook(webhookUrl, {
    username: "User Reviews",
    embeds: [embed]
  });
}

/**
 * Notification for new plugin/version submissions pending review.
 */
export async function sendPluginSubmittedWebhook(plugin: any, version: string, authorUsername: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_SUBMITTED_PLUGIN || process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const pluginUrl = `${CONFIG.BASE_URL}/plugins/${plugin.slug}?v=${version}`;

  const description = [
    `**Version**: ${version}`,
    `**Author**: ${authorUsername}`,
    `**Status**: ⏳ Pending Review`,
    "",
    plugin.description || `A new version has been submitted for review.`
  ].join("\n");

  const embed: DiscordEmbed = {
    title: `Submission: ${plugin.displayName}`,
    url: pluginUrl,
    description,
    color: CONFIG.COLORS.SUCCESS,
    timestamp: new Date().toISOString(),
    thumbnail: plugin.iconUrl ? { url: plugin.iconUrl } : undefined,
    footer: { text: "EndGit Moderation Queue", icon_url: CONFIG.LOGO_URL }
  };

  await sendWebhook(webhookUrl, {
    username: "Plugin Updates",
    embeds: [embed]
  });
}

/**
 * Notification for when a plugin or version is rejected or flagged.
 */
export async function sendPluginModerationWebhook(plugin: any, status: string, reason: string | null, adminUsername: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_MODERATION || process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const pluginUrl = `${CONFIG.BASE_URL}/plugins/${plugin.slug}`;
  const color = status === "APPROVED" ? CONFIG.COLORS.SUCCESS : CONFIG.COLORS.DANGER;

  const description = [
    `**New Status**: **${status}**`,
    `**Action By**: @${adminUsername}`,
    "",
    `**Reason**: ${reason || "No reason specified."}`
  ].join("\n");

  const embed: DiscordEmbed = {
    title: `Moderation: ${plugin.displayName}`,
    url: pluginUrl,
    description,
    color: color,
    timestamp: new Date().toISOString(),
    footer: { text: "EndGit Security & Safety", icon_url: CONFIG.LOGO_URL }
  };

  await sendWebhook(webhookUrl, {
    username: "Moderation Logs",
    embeds: [embed]
  });
}

/**
 * Notification for when a plugin is reported by a user.
 */
export async function sendPluginReportWebhook(plugin: any, reporterUsername: string, reason: string, details?: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_MODERATION || process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const pluginUrl = `${CONFIG.BASE_URL}/plugins/${plugin.slug}`;

  const description = [
    `**Reporter**: ${reporterUsername}`,
    `**Reason**: **${reason}**`,
    "",
    `**Details**: ${details || "No additional details provided."}`
  ].join("\n");

  const embed: DiscordEmbed = {
    title: `Plugin Reported: ${plugin.displayName}`,
    url: pluginUrl,
    description,
    color: CONFIG.COLORS.DANGER,
    timestamp: new Date().toISOString(),
    footer: { text: "EndGit Safety Report", icon_url: CONFIG.LOGO_URL }
  };

  await sendWebhook(webhookUrl, {
    username: "Safety Alerts",
    embeds: [embed]
  });
}



