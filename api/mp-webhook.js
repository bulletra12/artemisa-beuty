// Mercado Pago — Webhook de notificaciones para Artemisa Beauty
// MP llama aquí cuando cambia un pago. Consultamos el pago real, sacamos su
// estado y la referencia del pedido (external_reference) y marcamos el panel.
//
// Variable de entorno: MP_ACCESS_TOKEN (la misma que usa crear-pago.js)

const { marcarPedidoPorOrderId } = require('./_firestore');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    // Siempre respondemos 200 rápido para que MP no reintente de más
    const responder = () => { if (!res.headersSent) res.status(200).json({ received: true }); };

    // Sacar el id del pago (MP manda varios formatos)
    const q = req.query || {};
    const body = req.body || {};
    const tipo = q.type || q.topic || body.type || '';
    let payId = (body.data && body.data.id) || q['data.id'] || q.id || '';

    // Solo nos interesan notificaciones de pagos
    if (tipo && String(tipo).indexOf('payment') < 0) { responder(); return; }
    if (!payId || !accessToken) { responder(); return; }

    // Consultar el pago real en Mercado Pago
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(payId), {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const pago = await r.json().catch(() => ({}));
    const estado = pago.status || '';
    const orderId = pago.external_reference || '';
    console.log('[MP webhook]', payId, estado, orderId);

    if (orderId) {
      if (estado === 'approved') {
        await marcarPedidoPorOrderId(orderId, '✅ PAGADO (Mercado Pago)');
      } else if (['rejected', 'cancelled', 'charged_back'].includes(estado)) {
        await marcarPedidoPorOrderId(orderId, '❌ Mercado Pago cancelado');
      }
      // in_process / pending: aún no final, no tocamos el pedido
    }

    responder();
  } catch (err) {
    if (!res.headersSent) res.status(200).json({ received: true, error: err.message });
  }
};
