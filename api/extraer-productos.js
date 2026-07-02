module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: false, error: 'Sin API key' });

  let url = '', categoria = 'Cabello';
  try { const b = req.body || {}; url = b.url || ''; categoria = b.categoria || 'Cabello'; } catch(e) {}

  const prompt = url
    ? `Analiza esta URL de proveedor: ${url}. Infiere mínimo 6 productos de belleza con precios en pesos colombianos. Responde SOLO con JSON array: [{"nombre":"...","descripcion":"2 frases para Artemisa Beauty Colombia","precio_proveedor":50000,"emoji":"💄"}]`
    : `Lista 6 productos capilares colombianos populares. Responde SOLO con JSON array: [{"nombre":"...","descripcion":"2 frases","precio_proveedor":50000,"emoji":"💄"}]`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await r.json();
    const txt = d.content?.[0]?.text || '[]';
    const m = txt.match(/\[[\s\S]*\]/);
    const productos = m ? JSON.parse(m[0]) : [];
    return res.status(200).json({ ok: true, productos });
  } catch(e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
};
