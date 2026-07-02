module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ ok: false, error: 'Sin API key configurada' });
    const { url, categoria } = req.body || {};
    if (!url) return res.status(200).json({ ok: false, error: 'URL requerida' });
    const prompt = `Analiza esta URL de proveedor de belleza: ${url}\n\nExtrae o infiere productos disponibles. Responde SOLO con JSON array sin backticks:\n[{"nombre":"...","descripcion":"2 frases atractivas para Artemisa Beauty Colombia","precio_proveedor":50000,"emoji":"💄"}]\n\nSi no puedes acceder infiere mínimo 6 productos representativos con precios en pesos colombianos. Categoría: ${categoria||'Cabello'}`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const texto = data.content?.[0]?.text || '[]';
    const match = texto.match(/\[[\s\S]*\]/);
    if (!match) return res.status(200).json({ ok: false, error: 'No se encontraron productos' });
    const productos = JSON.parse(match[0]);
    return res.status(200).json({ ok: true, productos });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
