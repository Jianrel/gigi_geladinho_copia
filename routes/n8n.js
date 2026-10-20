// Rotas chamadas pelo n8n (enquete de status do pedido no WhatsApp).
// Autenticação: Basic com as mesmas credenciais que o site usa para chamar o n8n.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');
const { ORDEM, mudarStatusPedido } = require('../utils/statusPedido');

function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

router.use((req, res, next) => {
  const user = process.env.N8N_USER, pass = process.env.N8N_PASS;
  if (!user || !pass) return res.status(503).json({ erro: 'Integração com n8n não configurada' });
  const esperado = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  if (!iguais(req.headers.authorization || '', esperado)) return res.status(401).json({ erro: 'Não autorizado' });
  next();
});

// guarda o id da mensagem de enquete enviada à Gigi, para ligar o voto ao pedido
router.post('/pedido/:id/enquete', wrap(async (req, res) => {
  const { enqueteId } = req.body;
  if (!enqueteId) return res.status(400).json({ erro: 'enqueteId obrigatório' });
  const r = await db.run('UPDATE pedidos SET wa_enquete_id=? WHERE id=?', [enqueteId, req.params.id]);
  if (!r.changes) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json({ ok: true });
}));

// voto na enquete: só avança o pedido (nunca volta) e ignora pedidos cancelados
router.post('/enquete-voto', wrap(async (req, res) => {
  const { enqueteId } = req.body;
  const opcao = String(req.body.opcao || '').toLowerCase();
  const status = opcao.includes('separa') ? 'em_producao' : opcao.includes('entreg') ? 'entregue' : null;
  if (!enqueteId || !status) return res.status(400).json({ erro: 'Voto inválido' });

  const pedido = await db.get('SELECT id, status FROM pedidos WHERE wa_enquete_id=?', [enqueteId]);
  if (!pedido) return res.status(404).json({ erro: 'Enquete não corresponde a nenhum pedido' });
  if (pedido.status === 'cancelado' || ORDEM[status] <= ORDEM[pedido.status])
    return res.json({ ok: true, mudou: false, pedido_id: pedido.id, status: pedido.status });

  const r = await mudarStatusPedido(pedido.id, status);
  res.json({ ok: true, mudou: r.mudou, pedido_id: pedido.id, status });
}));

module.exports = router;
