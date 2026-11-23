import { getStorage } from 'firebase-admin/storage';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

// El bucket de Firebase Storage del proyecto (fotos de visitas y grabaciones
// de sesiones de la app del vendedor).
export function bucket(): Bucket {
  return getStorage().bucket(process.env.STORAGE_BUCKET || `${process.env.GCLOUD_PROJECT || 'app-campo-aviva'}.firebasestorage.app`);
}
