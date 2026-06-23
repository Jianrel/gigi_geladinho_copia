// Rotas públicas usadas na tela de pedido do cliente, sem necessidade de login.
const express = require('express');
const router = express.Router();
const https = require('https');
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/sabores-publico', wrap(async (req, res) => {
  res.json(await db.all('SELECT id, nome, categoria, preco FROM sabores WHERE ativo=1 ORDER BY categoria, nome'));
}));

// registra o pedido no banco e dispara o webhook n8n (credenciais ficam no servidor)
router.post('/pedido-webhook', wrap(async (req, res) => {
  const { nome, telefone, itens } = req.body;
  if (!nome || !telefone || !Array.isArray(itens) || !itens.length)
    return res.status(400).json({ erro: 'Dados do pedido incompletos' });

  const sabores_geladinho = itens.map(i => `${i.sabor} (${i.qtd}x)`).join('\n');
  // Normalizar telefone: remover formatação e garantir código do país 55
  let telefoneNorm = (telefone || '').replace(/[\s\-\+\(\)]/g, '');
  if (!telefoneNorm.startsWith('55')) telefoneNorm = '55' + telefoneNorm;

  // 1. Salva o pedido no banco primeiro — fica registrado mesmo se o webhook falhar.
  const pedido = await db.run(
    'INSERT INTO pedidos (cliente_nome, telefone, itens, ponto_id) VALUES (?,?,?,1)',
    [nome, telefoneNorm, JSON.stringify(itens)]
  );

  // 2. Tenta notificar via webhook do n8n (best-effort — não derruba o pedido já salvo)
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const user = process.env.N8N_USER;
  const pass = process.env.N8N_PASS;
  if (!webhookUrl || !user || !pass) {
    console.error('⚠️  N8N_WEBHOOK_URL / N8N_USER / N8N_PASS não configurados — pedido salvo, mas notificação não foi enviada.');
  } else {
    try {
      const payload = JSON.stringify({
        body: {
          cliente: { nome, telefone: telefoneNorm },
          pedido: { sabores_geladinho }
        }
      });
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      const url = new URL(webhookUrl);
      await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Basic ${auth}`
          }
        };
        const r = https.request(options, resp => { resp.resume(); resp.on('end', resolve); });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });
    } catch (e) {
      console.error('Erro ao notificar webhook n8n (pedido já está salvo):', e.message);
    }
  }

  res.json({ ok: true, pedido_id: pedido.lastID });
}));

module.exports = router;
