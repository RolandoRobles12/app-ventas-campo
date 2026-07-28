// npm workspaces resuelve "@aviva/server" con un symlink
// (functions/node_modules/@aviva/server -> ../../server). Eso funciona para
// build/dev local, pero no hay garantía de que el symlink sobreviva el
// empaquetado que hace `firebase deploy` al subir esta carpeta a Cloud
// Build — y si no sobrevive, el contenedor final no encuentra el paquete
// (ERR_MODULE_NOT_FOUND) aunque el build local haya salido limpio.
//
// Este script reemplaza ese symlink por una copia física real de
// server/dist + server/package.json dentro de
// functions/node_modules/@aviva/server, para que lo que se suba sea
// contenido de verdad, no un symlink.
import { existsSync, lstatSync, mkdirSync, rmSync, unlinkSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(functionsRoot, '..', 'server');
const scopeDir = path.join(functionsRoot, 'node_modules', '@aviva');
const dest = path.join(scopeDir, 'server');

if (existsSync(dest)) {
  // unlinkSync en un symlink borra solo el link, nunca el destino real al
  // que apunta — a diferencia de seguir el link y borrar recursivamente.
  if (lstatSync(dest).isSymbolicLink()) unlinkSync(dest);
  else rmSync(dest, { recursive: true, force: true });
}

mkdirSync(dest, { recursive: true });
cpSync(path.join(serverRoot, 'dist'), path.join(dest, 'dist'), { recursive: true });
cpSync(path.join(serverRoot, 'package.json'), path.join(dest, 'package.json'));

console.log('[functions] @aviva/server copiado a node_modules/@aviva/server (dist + package.json)');
