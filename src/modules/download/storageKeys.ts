const ARTIFACT_KEY = /^artifacts\/[a-z0-9][a-z0-9-]{0,62}\/[1-9][0-9]*\/[A-Za-z0-9_.-]+\.(whl|so|dll)$/;

export function normalizeDownloadArtifactKey(value: string, expectedPluginSlug?: string): string {
  const downloadPrefix = "/api/v1/download/file/";
  let key = value;

  if (key.startsWith(downloadPrefix)) {
    key = key.slice(downloadPrefix.length);
  }

  try {
    key = decodeURIComponent(key);
  } catch {
    throw new Error("Invalid artifact key");
  }

  if (!ARTIFACT_KEY.test(key)) {
    throw new Error("Invalid artifact key");
  }

  if (expectedPluginSlug) {
    const [, slug] = key.split("/");
    if (slug !== expectedPluginSlug) {
      throw new Error("Artifact does not belong to this plugin");
    }
  }

  return key;
}
