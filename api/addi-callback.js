// Addi — Webhook / Callback para Artemisa Beauty
// Addi llama aquí (POST) con el resultado final de la transacción.
// Requisitos de Addi:
//   - El endpoint debe tener autenticación básica (Basic Auth).
//   - Debe responder HTTP 200 y DEVOLVER EXACTAMENTE EL MISMO BODY (JSON) que recibió.
//
// Variables de entorno en Vercel (de la sección "Credenciales de notificación" del portal de Addi):
//   ADDI_WEBHOOK_USER
//   ADDI_WEBHOOK_PASS
//
// Estados posibles que envía Addi: approved | rejected | declined | abandoned

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    // 1) Validar Basic Auth (Addi se autentica ante nosotros)
    const user = process.env.ADDI_WEBHOOK_USER;
    const pass = process.env.ADDI_WEBHOOK_PASS;
    if (user && pass) {
      const auth = req.headers.authorization || '';
      const esperado = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
      if (auth !== esperado) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).json({ error: 'No autorizado' });
      }
    }

    // 2) Leer el body (el estado de la transacción)
    const data = req.body || {};
    // Addi envía status, orderId, approvedAmount, etc.  Lo registramos en los logs de Vercel.
    console.log('[ADDI callback]', JSON.stringify(data));

    // 3) Responder 200 con EXACTAMENTE el mismo body recibido (obligatorio para Addi)
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
