/**
 * S3 driver (Backblaze B2, R2, or any S3 API). Local disk stays the fallback.
 * Pattern: store the object KEY in Postgres; presign fresh URLs on every read
 * (presigned links expire, keys don't — same pattern Neon buckets would use).
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3Configured = [
  process.env.S3_ENDPOINT,
  process.env.S3_BUCKET,
  process.env.S3_ACCESS_KEY,
  process.env.S3_SECRET_KEY,
].every((value) => !!value?.trim());

export const storageDriver = (
  process.env.STORAGE_DRIVER || (s3Configured ? 's3' : 'local')
).toLowerCase();
export const isS3 = storageDriver === 's3';

let client: S3Client | null = null;

function bucket(): string {
  const b = (process.env.S3_BUCKET || '').trim();
  if (!b) throw new Error('S3_BUCKET not set');
  return b;
}

export function s3Client(): S3Client {
  if (client) return client;
  const endpoint = (process.env.S3_ENDPOINT || '').trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = (process.env.S3_SECRET_KEY || '').trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 storage needs S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY');
  }
  client = new S3Client({
    region: (process.env.S3_REGION || 'auto').trim(),
    endpoint,
    forcePathStyle: true, // required by B2/Neon/R2-style endpoints
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/** Upload bytes under key; returns the key (stored in Postgres). */
export async function s3Upload(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: body, ContentType: contentType,
  }));
  return key;
}

/** Fresh presigned read URL (default 1h). */
export async function s3ReadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function s3DownloadUrl(key: string, filename: string, expiresIn = 3600): Promise<string> {
  const safeName = filename.replace(/[\\/\r\n"]/g, '_').trim() || 'download';
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(safeName).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return getSignedUrl(s3Client(), new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
  }), { expiresIn });
}

export async function s3Delete(key: string): Promise<void> {
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function safeKey(originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
}
