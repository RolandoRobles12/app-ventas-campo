import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';

// El apiKey de un web app de Firebase no es secreto: la seguridad la dan las
// reglas de Firestore y la verificación del ID token en el backend, no
// ocultar esta config. Es el mismo proyecto para dev y producción.
const firebaseConfig = {
  apiKey: 'AIzaSyCuwiodJIAxcz43vrYk2-eQOc2RTtNFNGI',
  authDomain: 'app-campo-aviva.firebaseapp.com',
  projectId: 'app-campo-aviva',
  storageBucket: 'app-campo-aviva.firebasestorage.app',
  messagingSenderId: '816682987350',
  appId: '1:816682987350:web:b4a8668d6bfcca86db30f7',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const ALLOWED_EMAIL_DOMAIN = 'avivacredito.com';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN });
