// Sistecrédito — Crear transacción (pago a cuotas) para Artemisa Beauty
// Usa la pasarela de Sistecrédito (credinet.co): crea la transacción y, si ya
// está lista, devuelve la URL de pago. Si aún no, devuelve el transactionId
// para que la página consulte el estado con /api/sistecredito-estado.
//
// Variables de entorno necesarias en Vercel (las entrega el área de
// integraciones de Sistecrédito):
//   SISTECREDITO_SUB_KEY    -> Ocp-Apim-Subscription-Key
//   SISTECREDITO_APP_KEY    -> ApplicationKey (storeId)
//   SISTECREDITO_APP_TOKEN  -> ApplicationToken (vendorId)
//   (opcional) SISTECREDITO_ENV -> "Production" (por defecto) o "Staging"

const API_BASE = 'https://api.credinet.co/pay';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const subKey = process.env.SISTECREDITO_SUB_KEY;
    const appKey = process.env.SISTECREDITO_APP_KEY;
    const appToken = process.env.SISTECREDITO_APP_TOKEN;
    if (!subKey || !appKey || !appToken) {
      return res.status(200).json({ error: 'Faltan credenciales de Sistecrédito en el servidor' });
    }
    const entorno = (process.env.SISTECREDITO_ENV || 'Production');

    const { cliente, orderId, total } = req.body || {};
    if (!cliente || !cliente.documento) return res.status(400).json({ error: 'Faltan datos del cliente' });
    const value = Math.round(Number(total) || 0);
    if (value <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const baseUrl = req.headers.origin || 'https://www.artemisabeauty.com';
    const invoice = String(orderId || ('AB-' + Date.now()));
    const tel = String(cliente.telefono || '').replace(/\D/g, '');

    const headers = {
      'Content-Type': 'application/json',
      'SCLocation': '0,0',
      'SCOrigen': entorno,
      'country': 'co',
      'Ocp-Apim-Subscription-Key': subKey,
      'ApplicationKey': appKey,
      'ApplicationToken': appToken
    };

    const body = {
      invoice: invoice,
      description: 'Compra en Artemisa Beauty',
      paymentMethod: { paymentMethodId: 2 },
      userType: 0,
      currency: 'COP',
      value: value,
      sandbox: { isActive: false, status: 'Approved' },
      urlResponse: baseUrl + '/?pago_siste=' + encodeURIComponent(invoice),
      urlConfirmation: baseUrl + '/api/sistecredito-webhook',
      methodConfirmation: 'POST',
      client: {
        docType: String(cliente.tipodoc || 'CC'),
        document: String(cliente.documento).replace(/\D/g, ''),
        name: String(cliente.nombre || '').substring(0, 60),
        lastName: String(cliente.apellido || '').substring(0, 60),
        email: String(cliente.email || ''),
        phone: tel,
        country: 'co',
        city: String(cliente.ciudad || '').substring(0, 120),
        address: String(cliente.direccion || '').substring(0, 250)
      }
    };

    // 1) Crear la transacción
    const createResp = await fetch(API_BASE + '/create', {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    const createData = await createResp.json().catch(() => ({}));

    // Sistecrédito responde 200 o 201 al crear. Lo válido es que traiga data._id
    // y errorCode 0 (si viene errorCode).
    const creacionOk = createData && createData.data && createData.data._id
      && (typeof createData.errorCode !== 'number' || createData.errorCode === 0);
    if (!creacionOk) {
      return res.status(200).json({
        error: 'Sistecrédito no pudo crear la transacción',
        status: createResp.status,
        detalle: createData
      });
    }

    const transactionId = createData.data._id;
    let url = sacarUrl(createData);

    // 2) Si la URL no vino de una, consultar unas pocas veces (polling corto)
    for (let i = 0; i < 4 && !url; i++) {
      await esperar(1200);
      const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(transactionId), {
        method: 'GET', headers
      });
      const qData = await q.json().catch(() => ({}));
      url = sacarUrl(qData);
      const estado = qData && qData.data && qData.data.transactionStatus;
      if (['Rejected', 'Cancelled', 'Expired', 'Abandoned', 'Failed'].includes(estado)) {
        return res.status(200).json({ error: 'Sistecrédito rechazó la transacción', estado });
      }
    }

    // 3) Responder: con URL (redirige ya) o con el id (la página sigue consultando)
    return res.status(200).json({ url: url || '', transactionId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function sacarUrl(d) {
  try { return (d.data && d.data.paymentMethodResponse && d.data.paymentMethodResponse.paymentRedirectUrl) || ''; }
  catch (e) { return ''; }
}
function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
