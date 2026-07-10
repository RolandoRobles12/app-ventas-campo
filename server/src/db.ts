import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, FieldPath } from 'firebase-admin/firestore';

if (!getApps().length) {
  // Con el emulador (FIRESTORE_EMULATOR_HOST) basta un project id de mentira;
  // en Cloud Functions las credenciales y el project id los inyecta el runtime.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || 'demo-aviva';
    console.log(`Firestore: usando el EMULADOR en ${process.env.FIRESTORE_EMULATOR_HOST} (project "${projectId}"). Si no querías esto, quita FIRESTORE_EMULATOR_HOST de tu .env.`);
    initializeApp({ projectId });
  } else {
    const app = initializeApp();
    console.log(`Firestore: usando el proyecto real "${app.options.projectId || '(desconocido, revisa GOOGLE_APPLICATION_CREDENTIALS)'}".`);
  }
}

export const db = getFirestore();
// A diferencia de Prisma/SQL, Firestore rechaza `undefined` en un documento;
// esto lo trata igual que un campo omitido (equivalente a NULL en SQL).
db.settings({ ignoreUndefinedProperties: true });

export { Timestamp, FieldValue, FieldPath };
