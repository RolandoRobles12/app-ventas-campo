import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// En Cloud Functions el disco es efímero (o de solo lectura fuera de /tmp), así que
// las fotos de visitas deben ir a Firebase Storage en producción. En desarrollo local
// se siguen guardando en server/uploads, servido por express.static.
const driver = process.env.STORAGE_DRIVER === 'firebase' ? 'firebase' : 'disk';
const uploadDir = path.resolve(process.cwd(), 'uploads');

// Tipado como `any`: @google-cloud/storage expone tipos CJS y ESM incompatibles
// entre sí, y aquí solo usamos `file()/save()/makePublic()/publicUrl()`.
let bucketPromise: Promise<any> | null = null;

async function getBucket() {
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase-admin/app');
      const { getStorage } = await import('firebase-admin/storage');
      if (!getApps().length) initializeApp();
      return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    })();
  }
  return bucketPromise;
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export async function saveUpload(file: UploadedFile): Promise<string> {
  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;

  if (driver === 'firebase') {
    const bucket = await getBucket();
    const blob = bucket.file(`uploads/${filename}`);
    await blob.save(file.buffer, { contentType: file.mimetype });
    await blob.makePublic();
    return blob.publicUrl();
  }

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), file.buffer);
  return `/uploads/${filename}`;
}
