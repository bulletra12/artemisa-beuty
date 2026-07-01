exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };
  try {
    const { nombre, categoria, modo, url } = JSON.parse(event.body);
    let prompt;
    if (modo === 'url' && url) {
      prompt = `Analiza este link de un producto de belleza: ${url}\n\nExtrae la información y responde SOLO en JSON sin backticks:\n{"nombre":"nombre del producto","descripcion":"descripción comercial de máximo 3 frases para una tienda colombiana llamada Artemisa Beauty"}\n\nSi no puedes acceder al link, usa la URL para inferir el nombre y genera una descripción apropiada.`;
    } else {
      prompt = `Eres experto en marketing de belleza colombiano. Escribe una descripción comercial breve (máximo 3 frases) y atractiva para este producto de Artemisa Beauty: "${nombre}" (categoría: ${categoria}). Solo responde con la descripción, sin introducción.`;
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const texto = data.content?.[0]?.text || '';
    if (modo === 'url') {
      try {
        const clean = texto.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return { statusCode: 200, body: JSON.stringify(parsed) };
      } catch {
        return { statusCode: 200, body: JSON.stringify({ nombre: '', descripcion: texto.trim() }) };
      }
    }
    return { statusCode: 200, body: JSON.stringify({ descripcion: texto.trim() }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
