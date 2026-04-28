// ─────────────────────────────────────────────────────────
// EndGit — Storage Interface
// ─────────────────────────────────────────────────────────

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}

export { LocalStorage } from "./local";
export { S3Storage } from "./s3";

export function createStorage(): StorageProvider {
  const type = process.env.STORAGE_TYPE || "local";
  const basePath = process.env.STORAGE_PATH || "./uploads";

  switch (type) {
    case "local":
      return new (require("./local").LocalStorage)(basePath);
    case "s3":
      return new (require("./s3").S3Storage)();
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}
