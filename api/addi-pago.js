// Addi — Crear transacción (Checkout BNPL) para Artemisa Beauty
// Autentica con Addi (OAuth client_credentials) y crea una "online-application".
// Devuelve la URL a la que se debe redirigir al cliente para pagar a cuotas.
//
// Variables de entorno necesarias en Vercel:
//   ADDI_CLIENT_ID      -> Client Id de Addi
//   ADDI_CLIENT_SECRET  -> Client Secret de Addi
//   (opcional) ADDI_ENV -> "produccion" (por defecto) o "sandbox"
//
// Acciones:
//   POST (sin action)        -> crea la aplicación y devuelve la URL de pago
//   GET  ?action=estado      -> consulta el estado por ?orderId= y actualiza el pedido

const { marcarPedidoPorOrderId } = require('./_firestore');

function addiToken(authData) { return authData && authData.access_token; }
// Mapea el estado de Addi a nuestro texto de panel. null = sigue pendiente.
function estadoPanelAddi(estado) {
  const e = String(estado || '').toLowerCase();
  if (e.includes('approved')) return '✅ PAGADO (Addi)';
  if (e.includes('rejected') || e.includes('declined') || e.includes('abandoned') || e.includes('cancel')) return '❌ Addi cancelado';
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query && req.query.action) || '';
  const clientId0 = process.env.ADDI_CLIENT_ID;
  const clientSecret0 = process.env.ADDI_CLIENT_SECRET;
  const sandbox0 = (process.env.ADDI_ENV || 'produccion').toLowerCase() === 'sandbox';
  const AUTH_URL0 = sandbox0 ? 'https://auth.addi-staging.com/oauth/token' : 'https://auth.addi.com/oauth/token';
  const API_BASE0 = sandbox0 ? 'https://api.addi-staging.com/' : 'https://api.addi.com/';
  const AUDIENCE0 = sandbox0 ? 'https://api.staging.addi.com' : 'https://api.addi.com';

  // ───── VERIFICAR ESTADO POR orderId (botón del panel) ─────
  if (action === 'estado') {
    try {
      if (!clientId0 || !clientSecret0) return res.status(200).json({ ok: false, error: 'Faltan credenciales de Addi en el servidor' });
      const orderId = (req.query && req.query.orderId) || '';
      if (!orderId) return res.status(400).json({ ok: false, error: 'Falta orderId' });
      const authResp = await fetch(AUTH_URL0, {
        method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ audience: AUDIENCE0, grant_type: 'client_credentials', client_id: clientId0, client_secret: clientSecret0 })
      });
      const token = addiToken(await authResp.json().catch(() => ({})));
      if (!token) return res.status(200).json({ ok: false, error: 'No se pudo autenticar con Addi' });
      const r = await fetch(API_BASE0 + 'v1/online-applications/' + encodeURIComponent(orderId), {
        method: 'GET', headers: { 'accept': 'application/json', 'authorization': 'bearer ' + token }
      });
      if (!r.ok) return res.status(200).json({ ok: false, pendiente: true, error: 'Addi aún no reporta estado de este pedido (status ' + r.status + ')' });
      const d = await r.json().catch(() => ({}));
      const estado = d.status || d.applicationStatus || d.transactionStatus || (d.application && d.application.status) || '';
      const textoPanel = estadoPanelAddi(estado);
      if (textoPanel) { await marcarPedidoPorOrderId(orderId, textoPanel); return res.status(200).json({ ok: true, estado, panel: textoPanel }); }
      return res.status(200).json({ ok: true, pendiente: true, estado: estado || 'pendiente' });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const clientId = clientId0;
    const clientSecret = clientSecret0;
    if (!clientId || !clientSecret) {
      return res.status(200).json({ error: 'Faltan credenciales de Addi (ADDI_CLIENT_ID / ADDI_CLIENT_SECRET)' });
    }

    // Entornos
    const sandbox = sandbox0;
    const AUTH_URL = AUTH_URL0;
    const API_BASE = API_BASE0;
    const AUDIENCE = AUDIENCE0;

    const { items, cliente, orderId, subtotal, envio } = req.body || {};
    if (!items || !items.length) return res.status(400).json({ error: 'Sin productos' });
    if (!cliente || !cliente.documento) return res.status(400).json({ error: 'Faltan datos del cliente' });

    // URL base de la tienda (para callback y retorno)
    const baseUrl = req.headers.origin || 'https://www.artemisabeauty.com';

    // 1) AUTENTICACIÓN (token nuevo por cada intento, como recomienda Addi)
    const authResp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        audience: AUDIENCE,
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    const authData = await authResp.json().catch(() => ({}));
    const token = authData.access_token;
    if (!token) {
      return res.status(200).json({ error: 'No se pudo autenticar con Addi', detalle: authData });
    }

    // 2) ARMAR EL BODY DE LA TRANSACCIÓN
    const _subtotal = Math.round(Number(subtotal) || 0);
    const _envio = Math.round(Number(envio) || 0);
    const totalAmount = _subtotal + _envio;
    const tel = String(cliente.telefono || '').replace(/\D/g, '');

    const direccion = {
      lineOne: String(cliente.direccion || '').substring(0, 250),
      city: String(cliente.ciudad || '').substring(0, 120),
      country: 'CO'
    };

    const body = {
      description: 'Compra en Artemisa Beauty',
      orderId: String(orderId || ('AB-' + Date.now())),
      totalAmount: totalAmount,
      shippingAmount: _envio,
      totalTaxesAmount: 0,
      currency: 'COP',
      items: items.map(i => ({
        sku: String(i.sku || i.name || 'item').substring(0, 60),
        name: String(i.name || 'Producto').substring(0, 120),
        quantity: parseInt(i.quantity) || 1,
        unitPrice: Math.round(Number(i.unit_price) || 0),
        tax: 0,
        pictureUrl: i.pictureUrl || '',
        category: i.category || 'Belleza'
      })),
      client: {
        idType: 'CC',
        idNumber: String(cliente.documento).replace(/\D/g, ''),
        firstName: String(cliente.nombre || '').substring(0, 60),
        lastName: String(cliente.apellido || '').substring(0, 60),
        email: String(cliente.email || ''),
        cellphone: tel,
        cellphoneCountryCode: '57',
        address: direccion
      },
      shippingAddress: direccion,
      billingAddress: direccion,
      allyUrlRedirection: {
        logoUrl: 'https://i.ibb.co/jkjZmJ9n/LOGO.jpg',
        callbackUrl: baseUrl + '/api/addi-callback',
        redirectionUrl: baseUrl + '/?pago_addi=' + encodeURIComponent(String(orderId || ''))
      }
    };

    // 3) CREAR LA APLICACIÓN — NO seguir el 301 automáticamente
    const createResp = await fetch(API_BASE + 'v1/online-applications', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        'authorization': 'bearer ' + token
      },
      body: JSON.stringify(body)
    });

    // Addi responde 301 con header Location (a veces 'opaqueredirect' en fetch)
    const location = createResp.headers.get('location');
    if (createResp.status === 301 || createResp.status === 302 || location) {
      if (location) return res.status(200).json({ url: location });
    }

    // Si no vino redirección, devolver el detalle del error
    const errData = await createResp.json().catch(() => ({}));
    return res.status(200).json({
      error: 'Addi no devolvió la URL de pago',
      status: createResp.status,
      detalle: errData
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
