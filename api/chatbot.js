module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    const { mensaje, historial, productos } = req.body || {};

    const sistema = `Eres Luna, la asistente virtual de Artemisa Beauty, una tienda colombiana de productos de belleza. Eres amable, conocedora y hablas en español colombiano.

Tu especialidad es: cuidado del cabello, skincare, maquillaje y productos corporales.

Productos disponibles en la tienda: ${productos || 'variedad de productos de belleza premium'}

Reglas:
- Responde siempre en español, de forma breve y útil (máximo 3 frases)
- Recomienda productos de la tienda cuando sea relevante
- Si preguntan por precio o disponibilidad, diles que revisen el catálogo
- No respondas temas que no sean belleza o la tienda
- Sé cálida y profesional`;

    const messages = [
      ...(historial || []),
      { role: 'user', content: mensaje }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: sistema,
        messages
      })
    });

    const data = await response.json();
    const respuesta = data.content?.[0]?.text || 'Lo siento, intenta de nuevo.';
    return res.status(200).json({ respuesta });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
