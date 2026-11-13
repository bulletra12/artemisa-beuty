// Sistecrédito (todo en uno) para Artemisa Beauty
// Un solo archivo para no pasar el límite de funciones de Vercel.
// Se elige la acción con ?action= :
//   ?action=pago     (POST) crea la transacción y devuelve la URL de pago
//   ?action=estado   (GET)  consulta el estado (?id=transactionId)
//   ?action=verificar (GET) consulta por ?orderId= y actualiza el pedido en el panel
//   ?action=webhook  (POST/GET) confirmación de Sistecrédito -> marca el pedido
//
// Variables de entorno en Vercel:
//   SISTECREDITO_SUB_KEY, SISTECREDITO_APP_KEY, SISTECREDITO_APP_TOKEN
//   (opcional) SISTECREDITO_ENV = "Production" (por defecto) o "Staging"

const { marcarPedidoPorOrderId, obtenerPedidoPorOrderId, actualizarCamposPedido } = require('./_firestore');

const API_BASE = 'https://api.credinet.co/pay';

// Mapea el estado de Sistecrédito a nuestro texto de panel. Devuelve null si sigue pendiente.
function estadoPanelSiste(estado) {
  if (estado === 'Approved') return '✅ PAGADO (Sistecrédito)';
  if (['Rejected', 'Cancelled', 'Expired', 'Abandoned', 'Failed'].includes(estado)) return '❌ Sistecrédito cancelado';
  return null;
}

function creds() {
  return {
    subKey: process.env.SISTECREDITO_SUB_KEY,
    appKey: process.env.SISTECREDITO_APP_KEY,
    appToken: process.env.SISTECREDITO_APP_TOKEN,
    entorno: (process.env.SISTECREDITO_ENV || 'Production')
  };
}
function headersSiste(c) {
  return {
    'Content-Type': 'application/json',
    'SCLocation': '0,0',
    'SCOrigen': c.entorno,
    'country': 'co',
    'Ocp-Apim-Subscription-Key': c.subKey,
    'ApplicationKey': c.appKey,
    'ApplicationToken': c.appToken
  };
}
function sacarUrl(d) {
  try { return (d.data && d.data.paymentMethodResponse && d.data.paymentMethodResponse.paymentRedirectUrl) || ''; }
  catch (e) { return ''; }
}
function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query && req.query.action) || '';

  try {
    // ───── CREAR TRANSACCIÓN ─────
    if (action === 'pago') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
      const c = creds();
      if (!c.subKey || !c.appKey || !c.appToken) return res.status(200).json({ error: 'Faltan credenciales de Sistecrédito en el servidor' });

      const { cliente, orderId, total } = req.body || {};
      if (!cliente || !cliente.documento) return res.status(400).json({ error: 'Faltan datos del cliente' });
      const value = Math.round(Number(total) || 0);
      if (value <= 0) return res.status(400).json({ error: 'Monto inválido' });

      const baseUrl = req.headers.origin || 'https://www.artemisabeauty.com';
      const invoice = String(orderId || ('AB-' + Date.now()));
      const tel = String(cliente.telefono || '').replace(/\D/g, '');
      const headers = headersSiste(c);

      const body = {
        invoice: invoice,
        description: 'Compra en Artemisa Beauty',
        paymentMethod: { paymentMethodId: 2 },
        userType: 0,
        currency: 'COP',
        value: value,
        sandbox: { isActive: false, status: 'Approved' },
        urlResponse: baseUrl + '/?pago_siste=' + encodeURIComponent(invoice),
        urlConfirmation: baseUrl + '/api/sistecredito?action=webhook',
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

      const createResp = await fetch(API_BASE + '/create', { method: 'POST', headers, body: JSON.stringify(body) });
      const createData = await createResp.json().catch(() => ({}));
      const creacionOk = createData && createData.data && createData.data._id
        && (typeof createData.errorCode !== 'number' || createData.errorCode === 0);
      if (!creacionOk) {
        return res.status(200).json({ error: 'Sistecrédito no pudo crear la transacción', status: createResp.status, detalle: createData });
      }

      const transactionId = createData.data._id;
      // Guardar el id de la transacción en el pedido para poder verificarlo luego.
      try { await actualizarCamposPedido(invoice, { sisteTxId: String(transactionId) }); } catch (e) { /* no bloquea el pago */ }
      let url = sacarUrl(createData);
      for (let i = 0; i < 4 && !url; i++) {
        await esperar(1200);
        const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(transactionId), { method: 'GET', headers });
        const qData = await q.json().catch(() => ({}));
        url = sacarUrl(qData);
        const estado = qData && qData.data && qData.data.transactionStatus;
        if (['Rejected', 'Cancelled', 'Expired', 'Abandoned', 'Failed'].includes(estado)) {
          return res.status(200).json({ error: 'Sistecrédito rechazó la transacción', estado });
        }
      }
      return res.status(200).json({ url: url || '', transactionId });
    }

    // ───── CONSULTAR ESTADO ─────
    if (action === 'estado') {
      const c = creds();
      if (!c.subKey || !c.appKey || !c.appToken) return res.status(200).json({ error: 'Faltan credenciales de Sistecrédito en el servidor' });
      const id = (req.query && req.query.id) || '';
      if (!id) return res.status(400).json({ error: 'Falta el id de la transacción' });
      const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(id), { method: 'GET', headers: headersSiste(c) });
      const d = await q.json().catch(() => ({}));
      return res.status(200).json({ url: sacarUrl(d), estado: (d.data && d.data.transactionStatus) || '' });
    }

    // ───── VERIFICAR POR orderId (botón del panel) ─────
    if (action === 'verificar') {
      const c = creds();
      if (!c.subKey || !c.appKey || !c.appToken) return res.status(200).json({ ok: false, error: 'Faltan credenciales de Sistecrédito en el servidor' });
      const orderId = (req.query && req.query.orderId) || '';
      if (!orderId) return res.status(400).json({ ok: false, error: 'Falta orderId' });
      const ped = await obtenerPedidoPorOrderId(orderId);
      if (!ped.ok) return res.status(200).json({ ok: false, error: 'No encontré ese pedido' });
      const txId = ped.data && ped.data.sisteTxId;
      if (!txId) return res.status(200).json({ ok: false, pendiente: true, error: 'Ese pedido no tiene transacción de Sistecrédito guardada (pedido viejo). Aparecerá al recibir el aviso.' });
      const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(txId), { method: 'GET', headers: headersSiste(c) });
      const d = await q.json().catch(() => ({}));
      const estado = (d.data && d.data.transactionStatus) || '';
      const textoPanel = estadoPanelSiste(estado);
      if (textoPanel) { await marcarPedidoPorOrderId(orderId, textoPanel); return res.status(200).json({ ok: true, estado, panel: textoPanel }); }
      return res.status(200).json({ ok: true, pendiente: true, estado: estado || 'pendiente' });
    }

    // ───── WEBHOOK / CONFIRMACIÓN ─────
    if (action === 'webhook') {
      const data = (req.method === 'POST') ? (req.body || {}) : (req.query || {});
      const nodo = data.data || data;
      const idTx = nodo._id || data._id || '';
      let invoice = nodo.invoice || data.invoice || '';
      let estado = nodo.transactionStatus || data.transactionStatus || '';
      console.log('[SISTECREDITO webhook]', estado, invoice, idTx);

      const c = creds();
      if (idTx && c.subKey && c.appKey && c.appToken) {
        try {
          const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(idTx), { method: 'GET', headers: headersSiste(c) });
          const qd = await q.json().catch(() => ({}));
          if (qd && qd.data) { estado = qd.data.transactionStatus || estado; invoice = qd.data.invoice || invoice; }
        } catch (e) { /* seguimos con el estado del webhook */ }
      }
      if (invoice) {
        if (estado === 'Approved') await marcarPedidoPorOrderId(invoice, '✅ PAGADO (Sistecrédito)');
        else if (['Rejected', 'Cancelled', 'Expired', 'Abandoned', 'Failed'].includes(estado)) await marcarPedidoPorOrderId(invoice, '❌ Sistecrédito cancelado');
      }
      return res.status(200).json({ received: true });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
