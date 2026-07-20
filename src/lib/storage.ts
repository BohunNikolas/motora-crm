import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * S3-совместимое хранилище файлов (сейчас Cloudflare R2).
 *
 * ВАЖНО (roles/архитектура): браузер НИКОГДА не ходит в хранилище напрямую —
 * только сервер (Vercel). Файлы приватные, отдаются через /api/files/[id]
 * с проверкой прав. Это обходит блокировку домена R2 у провайдера и не светит
 * бакет наружу.
 *
 * Имена переменных S3_* нейтральны — переезд на Hetzner+MinIO = смена значений
 * в .env, без правки кода.
 */

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;

let client: S3Client | null = null;
function s3(): S3Client {
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !endpoint || !bucket) {
    throw new Error(
      "Хранилище не настроено: заданы не все S3_* переменные (ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY)."
    );
  }
  client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // R2/MinIO
  });
  return client;
}

/** Настроено ли хранилище (для мягкой деградации UI, если переменных нет). */
export const storageConfigured = () =>
  Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
}

/** Читает объект в память (файлы у нас небольшие — фото/PDF). */
export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
