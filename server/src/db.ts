import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, FieldPath } from 'firebase-admin/firestore';

if (!getApps().length) {
  // Con el emulador (FIRESTORE_EMULATOR_HOST) el project id debe coincidir con
  // el proyecto real de Firebase Auth ('app-campo-aviva'): solo Firestore se
  // emula, Auth sigue siendo el real, así que verifyIdToken necesita que este
  // mismo app admin tenga el project id correcto para validar el "aud".
  // En Cloud Functions las credenciales y el project id los inyecta el runtime.
  initializeApp(
    process.env.FIRESTORE_EMULATOR_HOST
      ? { projectId: process.env.GCLOUD_PROJECT || 'app-campo-aviva' }
      : undefined,
  );
}

export const db = getFirestore();
// A diferencia de Prisma/SQL, Firestore rechaza `undefined` en un documento;
// esto lo trata igual que un campo omitido (equivalente a NULL en SQL).
db.settings({ ignoreUndefinedProperties: true });

export { Timestamp, FieldValue, FieldPath };
