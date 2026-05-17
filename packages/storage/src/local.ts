import { StorageProvider } from "./index";
import * as fs from "fs/promises";
import * as path from "path";

export class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
  }

  async upload(
    key: string,
    data: Buffer,
    _contentType?: string
  ): Promise<string> {
    const filePath = this.resolveKey(key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolveKey(key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  getUrl(key: string): string {
    return `/api/v1/download/file/${encodeURIComponent(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveKey(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(key: string): string {
    if (!key || key.includes("\0") || path.isAbsolute(key)) {
      throw new Error("Invalid storage key");
    }

    const filePath = path.resolve(this.basePath, key);
    const relative = path.relative(this.basePath, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid storage key");
    }

    return filePath;
  }
}
