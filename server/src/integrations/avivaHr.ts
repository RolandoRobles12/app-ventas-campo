/**
 * Integración con el proyecto externo de Firebase "aviva-hr": ahí vive el
 * directorio real de empleados. Este backend no tiene cuenta de servicio de
 * ese proyecto (es de otro equipo), así que consulta su REST API pública de
 * Firestore (firestore.googleapis.com) sin autenticación — igual que hace
 * Ro-Bot-Web (https://github.com/RolandoRobles12/Ro-Bot-Web) contra el mismo
 * proyecto. Esto requiere que las reglas de Firestore de aviva-hr permitan
 * lectura no autenticada de `users`; si en el futuro se restringen, esta
 * consulta necesitará un token (API key o cuenta de servicio) además del
 * project id.
 *
 * Configurar con AVIVA_HR_PROJECT_ID (ver .env.example).
 */

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1';

export interface AvivaHrUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  initials: string | null;
  colorKey: string | null;
  quiosco: string | null;
  managerName: string | null;
}

export function isAvivaHrConfigured(): boolean {
  return !!process.env.AVIVA_HR_PROJECT_ID;
}

// Mismo acento de color que ya usan los vendedores sembrados a mano — aviva-hr
// solo manda una clave corta ("c1", "c2"...), no un hex, así que la traducimos.
const COLOR_PALETTE = ['#ef8b3e', '#0e8a8a', '#22a36c', '#c96a1e', '#2a6fdb', '#7a52c9', '#a855f7', '#c0392b'];

export function colorForKey(key: string | null, seed: string): string {
  const n = key ? parseInt(key.replace(/\D/g, ''), 10) : NaN;
  if (!Number.isNaN(n) && n > 0) return COLOR_PALETTE[(n - 1) % COLOR_PALETTE.length];
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

// Mapea el `role` (posición) de aviva-hr al `producto` de campo de esta app.
// Confirmado contra documentos reales de la colección `users`:
//   "Promotor Aviva Tu Negocio"         -> Aviva Tu Negocio
//   "Promotor Aviva Tu Casa"            -> Aviva Construrama
//   "Marchand - Promotor Casa Marchand" -> Aviva Casa Marchand
const ROLE_TO_PRODUCTO: { test: RegExp; producto: string }[] = [
  { test: /marchand/i, producto: 'Aviva Casa Marchand' },
  { test: /aviva tu casa/i, producto: 'Aviva Construrama' },
  { test: /aviva tu negocio/i, producto: 'Aviva Tu Negocio' },
];

export function productoParaRole(role: string): string | null {
  return ROLE_TO_PRODUCTO.find((r) => r.test.test(role))?.producto ?? null;
}

function parseFirestoreValue(value: any): any {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseFirestoreValue);
  if ('mapValue' in value) return parseFirestoreFields(value.mapValue.fields || {});
  return null;
}

function parseFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) out[key] = parseFirestoreValue(val);
  return out;
}

function mapDoc(id: string, data: Record<string, any>): AvivaHrUser {
  const avatar = data.avatar || {};
  return {
    id,
    fullName: data.fullName || `${data.first || ''} ${data.last || ''}`.trim(),
    email: (data.email || '').toLowerCase(),
    role: data.role || '',
    status: data.status || '',
    initials: avatar.initials || null,
    colorKey: avatar.color || null,
    quiosco: data.quiosco || null,
    managerName: data.managerName || null,
  };
}

// Trae usuarios activos/invitados de aviva-hr. Incluye 'active' e 'invited';
// excluye 'suspended' e 'inactive' — mismo criterio que Ro-Bot-Web.
export async function fetchAvivaHrUsers(): Promise<AvivaHrUser[]> {
  const projectId = process.env.AVIVA_HR_PROJECT_ID;
  if (!projectId) return [];

  const url = `${FIRESTORE_REST_BASE}/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'IN',
          value: { arrayValue: { values: [{ stringValue: 'active' }, { stringValue: 'invited' }] } },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`aviva-hr respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const rows = (await res.json()) as Array<{ document?: { name: string; fields: Record<string, any> } }>;
  return rows
    .filter((r) => r.document)
    .map((r) => {
      const id = r.document!.name.split('/').pop()!;
      return mapDoc(id, parseFirestoreFields(r.document!.fields));
    })
    .filter((u) => u.email);
}
