exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };
  try {
    const { url, categoria } = JSON.parse(event.body);

    const prompt = `Eres un experto en productos de belleza colombianos. Analiza esta URL de un proveedor: ${url}

Extrae o infiere todos los productos disponibles. Responde SOLO con un JSON array sin backticks ni explicación adicional:
[{"nombre":"nombre del producto","descripcion":"descripción comercial atractiva de 2 frases para una tienda colombiana llamada Artemisa Beauty","precio_proveedor":50000,"emoji":"💄"}]

Si no puedes acceder a la URL, usa el dominio y la ruta para inferir mínimo 6 productos representativos de esa marca con precios estimados en pesos colombianos. Categoría principal: ${categoria}.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await res.json();
    const texto = data.content?.[0]?.text || '[]';
    const match = texto.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No se pudo parsear la respuesta');
    const productos = JSON.parse(match[0]);
    return { statusCode: 200, body: JSON.stringify({ ok: true, productos }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
