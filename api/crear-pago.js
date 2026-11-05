module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(200).json({ error: 'Sin Access Token de Mercado Pago' });

    const { items, comprador } = req.body || {};
    if (!items || !items.length) return res.status(400).json({ error: 'Carrito vacío' });

    // Armar los items para Mercado Pago
    const mpItems = items.map(i => ({
      title: String(i.title || 'Producto').substring(0, 250),
      quantity: parseInt(i.quantity) || 1,
      unit_price: Math.round(Number(i.unit_price) || 0),
      currency_id: 'COP'
    }));

    // URL base de la tienda (para los retornos)
    const baseUrl = req.headers.origin || 'https://www.artemisabeauty.com';

    const preferencia = {
      items: mpItems,
      back_urls: {
        success: baseUrl + '/?pago=exitoso',
        failure: baseUrl + '/?pago=fallido',
        pending: baseUrl + '/?pago=pendiente'
      },
      auto_return: 'approved',
      statement_descriptor: 'ARTEMISA BEAUTY'
    };

    // Datos del comprador (opcional)
    if (comprador && comprador.email) {
      preferencia.payer = {
        name: comprador.nombre || '',
        email: comprador.email,
        phone: comprador.telefono ? { number: comprador.telefono } : undefined
      };
    }

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify(preferencia)
    });

    const data = await response.json();

    if (data.init_point || data.sandbox_init_point) {
      return res.status(200).json({
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
        id: data.id
      });
    } else {
      return res.status(200).json({ error: 'No se pudo crear el pago', detalle: data });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
