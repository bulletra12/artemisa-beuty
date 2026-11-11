// Sistecrédito — Webhook / Confirmación para Artemisa Beauty
// Sistecrédito llama aquí (POST) cada vez que cambia el estado de una
// transacción (PendingForPaymentMethod, Pending, Approved, Rejected, ...).
// Registramos la notificación en los logs de Vercel y respondemos 200.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // La pasarela puede notificar por POST (body) o por GET (querystring)
    const data = (req.method === 'POST') ? (req.body || {}) : (req.query || {});
    const estado = (data && (data.transactionStatus || (data.data && data.data.transactionStatus))) || 'desconocido';
    const invoice = (data && (data.invoice || (data.data && data.data.invoice))) || '';
    console.log('[SISTECREDITO webhook]', estado, invoice, JSON.stringify(data));

    // Confirmamos recepción a la pasarela
    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
