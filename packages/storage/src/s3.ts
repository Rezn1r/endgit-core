import { StorageProvider } from "./index";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || "endgit-artifacts";
    
    this.client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT, // e.g. https://s3.us-east-1.amazonaws.com or MinIO/R2 endpoint
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", // Required for MinIO
    });
  }

  async upload(key: string, data: Buffer, contentType?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType || "application/octet-stream",
    });

    await this.client.send(command);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Failed to download ${key} from S3: Response body is empty`);
    }
    
    // Convert Node.js readable stream to Buffer
    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  // Generate a presigned URL that is valid for 1 hour
  // If the bucket is public, this could just return the public URL, 
  // but presigned URLs are safer for private artifacts.
  async getPresignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  // Synchronous getUrl for compatibility with the interface. 
  // In API we will redirect to /api/v1/download/file/:key which internally fetches or redirects to presigned URL
  getUrl(key: string): string {
    return `/api/v1/download/file/${encodeURIComponent(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }
}
