const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { mes, ano, dataInicio, dataFim } = req.query;

  let whereVendas, whereGastos, whereAvulsos, p;
  if (dataInicio && dataFim) {
    whereVendas  = 'l.data >= ? AND l.data <= ?';
    whereGastos  = 'g.data >= ? AND g.data <= ?';
    whereAvulsos = 'data >= ? AND data <= ?';
    p = [dataInicio, dataFim];
  } else {
    whereVendas  = "EXTRACT(MONTH FROM l.data::date) = ? AND EXTRACT(YEAR FROM l.data::date) = ?";
    whereGastos  = "EXTRACT(MONTH FROM g.data::date) = ? AND EXTRACT(YEAR FROM g.data::date) = ?";
    whereAvulsos = "EXTRACT(MONTH FROM data::date) = ? AND EXTRACT(YEAR FROM data::date) = ?";
    p = [parseInt(mes), parseInt(ano)];
  }

  // Entradas: vendas dos lançamentos
  const vendas = await db.all(`
    SELECT l.data, s.nome as descricao, 'entrada' as tipo, 'Vendas' as categoria,
      GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco::numeric as valor
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE ${whereVendas}
      AND GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) > 0
  `, p);

  // Saídas: gastos de produção
  const gastos = await db.all(`
    SELECT g.data, COALESCE('Produção: ' || s.nome, g.descricao, 'Gasto avulso') as descricao,
      'saida' as tipo, 'Produção' as categoria, g.valor
    FROM gastos_producao g LEFT JOIN sabores s ON g.sabor_id = s.id
    WHERE ${whereGastos}
  `, p);

  // Lançamentos avulsos
  const avulsos = await db.all(`
    SELECT id, data, descricao, tipo, categoria, valor
    FROM fluxo_caixa_avulso
    WHERE ${whereAvulsos}
  `, p);

  // Combinar e ordenar por data
  // Ordenar do mais antigo para o mais novo para calcular saldo corretamente
  const todos = [
    ...vendas.map(r => ({ ...r, origem: 'lancamento' })),
    ...gastos.map(r => ({ ...r, origem: 'gasto' })),
    ...avulsos.map(r => ({ ...r, origem: 'avulso' }))
  ].sort((a, b) => a.data.localeCompare(b.data));

  // Calcular saldo acumulado (do mais antigo ao mais novo)
  let saldo = 0;
  todos.forEach(r => {
    r.valor = parseFloat(r.valor) || 0;
    saldo += r.tipo === 'entrada' ? r.valor : -r.valor;
    r.saldo = Math.round(saldo * 100) / 100;
  });

  // Inverter para exibir o mais recente primeiro
  res.json(todos.reverse());
}));

router.post('/avulso', wrap(async (req, res) => {
  const { data, descricao, tipo, categoria, valor } = req.body;
  if (!data || !descricao || !tipo || !valor) return res.status(400).json({ erro: 'Campos obrigatórios: data, descricao, tipo, valor' });
  const r = await db.run(
    'INSERT INTO fluxo_caixa_avulso (data,descricao,tipo,categoria,valor) VALUES (?,?,?,?,?)',
    [data, descricao, tipo, categoria || null, parseFloat(valor)]
  );
  res.json({ id: r.lastID });
}));

router.delete('/avulso/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM fluxo_caixa_avulso WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
