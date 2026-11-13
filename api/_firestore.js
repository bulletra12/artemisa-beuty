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

// Busca un pedido por su campo orderId y devuelve {ok, docId, data}.
async function obtenerPedidoPorOrderId(orderId) {
  try {
    if (!orderId) return { ok: false, error: 'Sin orderId' };
    const sa = getSA();
    if (!sa) return { ok: false, error: 'Falta FIREBASE_SERVICE_ACCOUNT' };
    const token = await getAccessToken(sa);
    if (!token) return { ok: false, error: 'No se pudo autenticar con Firebase' };
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
    const data = {}; const f = hit.document.fields || {};
    for (const k in f) data[k] = fsDecode(f[k]);
    return { ok: true, docId, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Actualiza campos arbitrarios de un pedido (por orderId), con la llave de servicio.
async function actualizarCamposPedido(orderId, campos) {
  try {
    if (!orderId || !campos) return { ok: false, error: 'Sin datos' };
    const sa = getSA();
    if (!sa) return { ok: false, error: 'Falta FIREBASE_SERVICE_ACCOUNT' };
    const token = await getAccessToken(sa);
    if (!token) return { ok: false, error: 'No se pudo autenticar con Firebase' };
    const found = await obtenerPedidoPorOrderId(orderId);
    if (!found.ok) return found;
    const fields = {}; const mask = [];
    for (const k in campos) { fields[k] = fsEncode(campos[k]); mask.push(k); }
    if (!mask.length) return { ok: true };
    const qs = mask.map(m => 'updateMask.fieldPaths=' + encodeURIComponent(m)).join('&');
    const pr = await fetch(BASE + '/pedidos/' + found.docId + '?' + qs, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    return { ok: pr.ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Conversión de valores Firestore (REST) ↔ JS ──
function fsDecode(v) {
  if (v == null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecode);
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = fsDecode(f[k]); return o; }
  return undefined;
}
function fsEncode(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(fsEncode) } };
  if (typeof x === 'object') { const f = {}; for (const k in x) { if (x[k] !== undefined) f[k] = fsEncode(x[k]); } return { mapValue: { fields: f } }; }
  return { nullValue: null };
}

// Descuenta stock por color (y recalcula la cantidad total) con la llave de servicio.
// items: [{id, color, qty}]
async function descontarStockPorColor(items) {
  try {
    const sa = getSA();
    if (!sa) return { ok: false, error: 'Falta FIREBASE_SERVICE_ACCOUNT' };
    const token = await getAccessToken(sa);
    if (!token) return { ok: false, error: 'No se pudo autenticar con Firebase' };

    const porProd = {};
    (items || []).forEach(it => { const id = String(it.id); (porProd[id] = porProd[id] || []).push(it); });

    const resultados = [];
    for (const id of Object.keys(porProd)) {
      try {
        const r = await fetch(BASE + '/productos/' + encodeURIComponent(id), { headers: { 'Authorization': 'Bearer ' + token } });
        if (!r.ok) { resultados.push({ id, ok: false }); continue; }
        const doc = await r.json();
        const fields = doc.fields || {};
        let coloresLista = fsDecode(fields.coloresLista);
        let cantidad = fsDecode(fields.cantidad);
        const lineas = porProd[id];

        if (Array.isArray(coloresLista)) {
          lineas.forEach(l => {
            if (l.color) {
              const c = coloresLista.find(x => x && x.name === l.color);
              if (c && typeof c.stock === 'number') c.stock = Math.max(0, c.stock - (parseInt(l.qty) || 0));
            }
          });
        }
        // El stock global baja por la cantidad vendida (independiente del color)
        const totalQty = lineas.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
        if (typeof cantidad === 'number') {
          cantidad = Math.max(0, cantidad - totalQty);
        }

        const bodyFields = {}; const mask = [];
        if (Array.isArray(coloresLista)) { bodyFields.coloresLista = fsEncode(coloresLista); mask.push('coloresLista'); }
        if (typeof cantidad === 'number') { bodyFields.cantidad = fsEncode(cantidad); mask.push('cantidad'); }
        if (mask.length) {
          const qs = mask.map(m => 'updateMask.fieldPaths=' + m).join('&');
          const pr = await fetch(BASE + '/productos/' + encodeURIComponent(id) + '?' + qs, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: bodyFields })
          });
          resultados.push({ id, ok: pr.ok });
        }
      } catch (e) { resultados.push({ id, ok: false, error: e.message }); }
    }
    return { ok: true, resultados };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { marcarPedidoPorOrderId, descontarStockPorColor, obtenerPedidoPorOrderId, actualizarCamposPedido };
