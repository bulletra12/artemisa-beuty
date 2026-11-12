// Sistecrédito — Webhook / Confirmación para Artemisa Beauty
// Sistecrédito llama aquí (POST) cuando cambia el estado de una transacción.
// Verificamos el estado real contra la pasarela y marcamos el pedido en el panel.

const { marcarPedidoPorOrderId } = require('./_firestore');

const API_BASE = 'https://api.credinet.co/pay';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const data = (req.method === 'POST') ? (req.body || {}) : (req.query || {});
    const nodo = data.data || data; // el cuerpo puede venir plano o dentro de "data"
    const idTx = nodo._id || data._id || '';
    let invoice = nodo.invoice || data.invoice || '';
    let estado = nodo.transactionStatus || data.transactionStatus || '';

    console.log('[SISTECREDITO webhook]', estado, invoice, idTx);

    // 1) Verificar el estado REAL contra la pasarela (anti-fraude)
    const subKey = process.env.SISTECREDITO_SUB_KEY;
    const appKey = process.env.SISTECREDITO_APP_KEY;
    const appToken = process.env.SISTECREDITO_APP_TOKEN;
    if (idTx && subKey && appKey && appToken) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'SCLocation': '0,0',
          'SCOrigen': (process.env.SISTECREDITO_ENV || 'Production'),
          'country': 'co',
          'Ocp-Apim-Subscription-Key': subKey,
          'ApplicationKey': appKey,
          'ApplicationToken': appToken
        };
        const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(idTx), { method: 'GET', headers });
        const qd = await q.json().catch(() => ({}));
        if (qd && qd.data) {
          estado = qd.data.transactionStatus || estado;
          invoice = qd.data.invoice || invoice;
        }
      } catch (e) { /* si falla la verificación, seguimos con el estado del webhook */ }
    }

    // 2) Escribir el resultado en el panel (pedido con orderId == invoice)
    if (invoice) {
      if (estado === 'Approved') {
        await marcarPedidoPorOrderId(invoice, '✅ PAGADO (Sistecrédito)');
      } else if (['Rejected', 'Cancelled', 'Expired', 'Abandoned', 'Failed'].includes(estado)) {
        await marcarPedidoPorOrderId(invoice, '❌ Sistecrédito cancelado');
      }
      // Pending / PendingForPaymentMethod / Started: aún no es final, no tocamos el pedido
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
