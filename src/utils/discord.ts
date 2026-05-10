export async function sendPluginApprovedWebhook(plugin: any, version: any, reviewerUsername: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const category = plugin.tags && plugin.tags.length > 0 ? plugin.tags[0] : "General";
  const authorStr = version.producers && version.producers.length > 0 
    ? version.producers.map((p: any) => `${p.role}: ${p.githubUser}`).join("\n")
    : `Author: ${plugin.author?.username || "Unknown"}`;

  const pluginUrl = `https://endgit.dev/plugins/${plugin.slug}?v=${version.version}`;

  const embed = {
    title: `${plugin.displayName} v${version.version}`,
    url: pluginUrl,
    description: plugin.description || `Plugin for Endstone`,
    color: 0x2ecc71, // Green
    fields: [
      { name: "Category", value: category, inline: false },
      { name: "Author", value: authorStr, inline: false },
      { name: "State", value: `Approved by @${reviewerUsername}`, inline: false },
      { name: "Link", value: `[View on EndGit](${pluginUrl})`, inline: false }
    ],
    timestamp: new Date().toISOString()
  };

  if (plugin.iconUrl) {
    (embed as any).image = { url: plugin.iconUrl };
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Plugin Updates",
        embeds: [embed]
      })
    });
  } catch (error) {
    console.error("Failed to send plugin approved webhook:", error);
  }
}

export async function sendNewRatingWebhook(plugin: any, rating: any, reviewerName: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_NEW_RATING;
  if (!webhookUrl) return;

  const pluginUrl = `https://endgit.dev/plugins/${plugin.slug}`;
  
  const embed = {
    title: `New Review on ${plugin.displayName || plugin.name}`,
    url: pluginUrl,
    description: `Made by ${reviewerName}!`,
    color: 0x3498db, // Blue
    fields: [
      { name: "Score:", value: `${rating.score}/5`, inline: false },
      { name: "Message:", value: rating.comment || "No comment provided.", inline: false }
    ],
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "User reviews",
        embeds: [embed]
      })
    });
  } catch (error) {
    console.error("Failed to send new rating webhook:", error);
  }
}

export async function sendPluginSubmittedWebhook(plugin: any, version: string, authorUsername: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_SUBMITTED_PLUGIN || process.env.DISCORD_WEBHOOK_APPROVED_PLUGIN;
  if (!webhookUrl) return;

  const pluginUrl = `https://endgit.dev/plugins/${plugin.slug}?v=${version}`;

  const embed = {
    title: `New Plugin Submission: ${plugin.displayName} v${version}`,
    url: pluginUrl,
    description: plugin.description || `A new version has been submitted for review!`,
    color: 0xf1c40f, // Yellow
    fields: [
      { name: "Author", value: `@${authorUsername}`, inline: false },
      { name: "Link", value: `[View on EndGit](${pluginUrl})`, inline: false }
    ],
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Plugin Updates",
        embeds: [embed]
      })
    });
  } catch (error) {
    console.error("Failed to send plugin submitted webhook:", error);
  }
}
