import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@aviva/ui';

// Las fotos de visita se suben directo del navegador a Firebase Storage (no
// al API): un request a la API que pase por el rewrite de Firebase Hosting
// tiene un límite fijo de 10 MB, sin importar qué límite pongamos en el
// servidor — con varias fotos de celular eso se rebasaba fácil. El API solo
// recibe las URLs resultantes (ver POST /visitas).
export async function subirFotos(vendedorId: string, fotos: Blob[]): Promise<string[]> {
  return Promise.all(fotos.map(async (foto) => {
    const ext = foto.type === 'image/png' ? 'png' : 'jpg';
    const path = `visitas/${vendedorId}/${crypto.randomUUID()}.${ext}`;
    const fotoRef = ref(storage, path);
    await uploadBytes(fotoRef, foto, { contentType: foto.type || 'image/jpeg' });
    return getDownloadURL(fotoRef);
  }));
}
