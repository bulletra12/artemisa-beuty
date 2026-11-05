// Addi — Crear transacción (Checkout BNPL) para Artemisa Beauty
// Autentica con Addi (OAuth client_credentials) y crea una "online-application".
// Devuelve la URL a la que se debe redirigir al cliente para pagar a cuotas.
//
// Variables de entorno necesarias en Vercel:
//   ADDI_CLIENT_ID      -> Client Id de Addi
//   ADDI_CLIENT_SECRET  -> Client Secret de Addi
//   (opcional) ADDI_ENV -> "produccion" (por defecto) o "sandbox"

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const clientId = process.env.ADDI_CLIENT_ID;
    const clientSecret = process.env.ADDI_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(200).json({ error: 'Faltan credenciales de Addi (ADDI_CLIENT_ID / ADDI_CLIENT_SECRET)' });
    }

    // Entornos
    const sandbox = (process.env.ADDI_ENV || 'produccion').toLowerCase() === 'sandbox';
    const AUTH_URL = sandbox ? 'https://auth.addi-staging.com/oauth/token' : 'https://auth.addi.com/oauth/token';
    const API_BASE = sandbox ? 'https://api.addi-staging.com/' : 'https://api.addi.com/';
    const AUDIENCE = sandbox ? 'https://api.staging.addi.com' : 'https://api.addi.com';

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
