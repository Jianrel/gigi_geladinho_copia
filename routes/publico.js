// Rotas públicas usadas na tela de pedido do cliente, sem necessidade de login.
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');
const { notificarN8n } = require('../utils/n8n');

router.get('/config', (req, res) => {
  const custo = process.env.CUSTO_FORNECEDOR;
  res.json({
    nomeLoja: process.env.NOME_LOJA || 'Geladinho Gourmet',
    subtituloLoja: process.env.SUBTITULO_LOJA || 'Geladinhos Gourmet',
    waNumero: process.env.WA_NUMERO || '',
    custoFornecedor: custo ? parseFloat(custo) : null
  });
});

router.get('/sabores-publico', wrap(async (req, res) => {
  res.json(await db.all('SELECT id, nome, categoria, preco FROM sabores WHERE ativo=1 ORDER BY categoria, nome'));
}));

// registra o pedido no banco e dispara o webhook n8n (credenciais ficam no servidor)
router.post('/pedido-webhook', wrap(async (req, res) => {
  const { nome, telefone, itens } = req.body;
  if (!nome || !telefone || !Array.isArray(itens) || !itens.length)
    return res.status(400).json({ erro: 'Dados do pedido incompletos' });

  // total calculado com os preços do banco (não confia em valores vindos do navegador)
  const precos = Object.fromEntries(
    (await db.all('SELECT nome, preco FROM sabores')).map(s => [s.nome, Number(s.preco) || 0])
  );
  const total = itens.reduce((a, i) => a + (Number(i.qtd) || 0) * (precos[i.sabor] || 0), 0);
  const totalFmt = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sabores_geladinho = itens.map(i => `${i.sabor} (${i.qtd}x)`).join('\n') + `\n\n*Total: ${totalFmt}*`;
  // Normalizar telefone: remover formatação e garantir código do país 55
  let telefoneNorm = (telefone || '').replace(/[\s\-\+\(\)]/g, '');
  if (!telefoneNorm.startsWith('55')) telefoneNorm = '55' + telefoneNorm;

  // 1. Salva o pedido no banco primeiro — fica registrado mesmo se o webhook falhar.
  const pedido = await db.run(
    'INSERT INTO pedidos (cliente_nome, telefone, itens) VALUES (?,?,?)',
    [nome, telefoneNorm, JSON.stringify(itens)]
  );

  // Entra no fluxo de caixa como "a receber"; vira realizado quando o pagamento for marcado
  if (total > 0) {
    try {
      const dataHoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      await db.run(
        `INSERT INTO fluxo_caixa_avulso (data, descricao, tipo, categoria, valor, status, data_prevista, valor_previsto, pedido_id)
         VALUES (?, ?, 'entrada', 'Vendas', ?, 'previsto', ?, ?, ?)`,
        [dataHoje, `Pedido #${pedido.lastID} — ${nome}`, total, dataHoje, total, pedido.lastID]
      );
    } catch (e) {
      console.error('Erro ao lançar pedido no fluxo de caixa (pedido já está salvo):', e.message);
    }
  }

  // 2. Notifica o n8n (best-effort — não derruba o pedido já salvo)
  await notificarN8n({
    evento: 'novo_pedido',
    cliente: { nome, telefone: telefoneNorm },
    pedido: { id: pedido.lastID, sabores_geladinho, total, total_formatado: totalFmt }
  });

  res.json({ ok: true, pedido_id: pedido.lastID });
}));

router.get('/cliente-historico', wrap(async (req, res) => {
  let tel = (req.query.telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return res.json({ encontrado: false });
  if (!tel.startsWith('55')) tel = '55' + tel;
  const pedido = await db.get(
    'SELECT cliente_nome, itens, criado_em FROM pedidos WHERE telefone=$1 ORDER BY criado_em DESC LIMIT 1',
    [tel]
  );
  if (!pedido) return res.json({ encontrado: false });
  res.json({
    encontrado: true,
    nome: pedido.cliente_nome,
    ultimoPedido: { itens: JSON.parse(pedido.itens), criadoEm: pedido.criado_em }
  });
}));

module.exports = router;
