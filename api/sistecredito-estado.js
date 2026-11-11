// Sistecrédito — Consultar estado de una transacción para Artemisa Beauty
// La página llama aquí con ?id=transactionId mientras espera la URL de pago.
// Devuelve { url, estado }. Las llaves quedan seguras en el servidor.

const API_BASE = 'https://api.credinet.co/pay';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const subKey = process.env.SISTECREDITO_SUB_KEY;
    const appKey = process.env.SISTECREDITO_APP_KEY;
    const appToken = process.env.SISTECREDITO_APP_TOKEN;
    if (!subKey || !appKey || !appToken) {
      return res.status(200).json({ error: 'Faltan credenciales de Sistecrédito en el servidor' });
    }
    const entorno = (process.env.SISTECREDITO_ENV || 'Production');
    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).json({ error: 'Falta el id de la transacción' });

    const headers = {
      'Content-Type': 'application/json',
      'SCLocation': '0,0',
      'SCOrigen': entorno,
      'country': 'co',
      'Ocp-Apim-Subscription-Key': subKey,
      'ApplicationKey': appKey,
      'ApplicationToken': appToken
    };

    const q = await fetch(API_BASE + '/GetTransactionResponse?transactionId=' + encodeURIComponent(id), {
      method: 'GET', headers
    });
    const d = await q.json().catch(() => ({}));
    const url = (d.data && d.data.paymentMethodResponse && d.data.paymentMethodResponse.paymentRedirectUrl) || '';
    const estado = (d.data && d.data.transactionStatus) || '';
    return res.status(200).json({ url, estado });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
