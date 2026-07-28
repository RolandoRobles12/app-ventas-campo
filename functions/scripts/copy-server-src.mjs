// Copia server/src (TypeScript fuente, no server/dist) a
// functions/src/_server antes de compilar, para que el propio tsc de
// functions compile TODO junto en un solo dist/ autocontenido — sin
// depender de "@aviva/server" como paquete npm separado.
//
// La razón: Firebase excluye node_modules de lo que sube a Cloud Build sin
// importar su contenido (symlink o copiado a mano, da igual) y lo reinstala
// del lado remoto solo con package.json — y ahí un "file:../server" nunca
// puede resolver porque esa carpeta no existe en ese contexto aislado. Al
// compilar el código de server como parte de functions (imports relativos
// normales, sin frontera de paquete), ese problema deja de existir.
import { existsSync, rmSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsRoot = path.resolve(__dirname, '..');
const serverSrc = path.resolve(functionsRoot, '..', 'server', 'src');
const dest = path.join(functionsRoot, 'src', '_server');

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(serverSrc, dest, { recursive: true });

console.log('[functions] server/src copiado a functions/src/_server para compilar junto');
