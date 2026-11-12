// Helper seguro para que los webhooks escriban en Firestore (panel de pedidos)
// Usa una llave de servicio de Firebase (env FIREBASE_SERVICE_ACCOUNT con el JSON)
// y la API REST de Firestore. No requiere instalar dependencias.
//
// En Vercel, crea la variable de entorno:
//   FIREBASE_SERVICE_ACCOUNT = { ...el JSON completo de la llave de servicio... }

const crypto = require('crypto');

const PROJECT = 'artemisa-beauty';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function getSA() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  let sa = null;
  try { sa = JSON.parse(raw); }
  catch (e) {
    try { sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e2) { return null; }
  }
  if (sa && sa.private_key && sa.private_key.indexOf('\\n') >= 0) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return sa;
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key)
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = unsigned + '.' + signature;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt)
  });
  const d = await resp.json().catch(() => ({}));
  return d.access_token || null;
}

// Busca el pedido cuyo campo orderId coincide y actualiza su estado.
// Devuelve {ok, ...}. Nunca lanza: si algo falla, devuelve ok:false.
async function marcarPedidoPorOrderId(orderId, estado) {
  try {
    if (!orderId) return { ok: false, error: 'Sin orderId' };
    const sa = getSA();
    if (!sa) return { ok: false, error: 'Falta FIREBASE_SERVICE_ACCOUNT' };
    const token = await getAccessToken(sa);
    if (!token) return { ok: false, error: 'No se pudo autenticar con Firebase' };

    // 1) Buscar el documento por el campo orderId
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'pedidos' }],
        where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: String(orderId) } } },
        limit: 1
      }
    };
    const qr = await fetch(BASE + ':runQuery', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });
    const rows = await qr.json().catch(() => []);
    const hit = Array.isArray(rows) ? rows.find(r => r && r.document) : null;
    if (!hit || !hit.document) return { ok: false, error: 'Pedido no encontrado', orderId };
    const docId = hit.document.name.split('/').pop();

    // 2) Actualizar solo el campo estado
    const pr = await fetch(BASE + '/pedidos/' + docId + '?updateMask.fieldPaths=estado', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { estado: { stringValue: String(estado) } } })
    });
    if (!pr.ok) {
      const t = await pr.text().catch(() => '');
      return { ok: false, error: 'No se pudo actualizar', detalle: t };
    }
    return { ok: true, docId, estado };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { marcarPedidoPorOrderId };
