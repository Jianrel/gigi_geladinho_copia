const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

// gasto de produção + atualização de estoque
router.post('/', wrap(async (req, res) => {
  const { data, sabor_id, descricao, valor, geladinhos_produzidos } = req.body;
  if (!data || !sabor_id || !geladinhos_produzidos) return res.status(400).json({ erro: 'Dados incompletos' });
  const qtd = Math.max(0, parseInt(geladinhos_produzidos) || 0);

  // 1. Grava o gasto de produção
  const gasto = await db.run(
    'INSERT INTO gastos_producao (data,sabor_id,descricao,valor,geladinhos_produzidos) VALUES (?,?,?,?,?)',
    [data, sabor_id, descricao, valor, qtd]
  );

  // 2. Atualiza estoque via lancamentos
  const existing = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=?', [data, sabor_id]
  );

  if (existing) {
    // Já existe lançamento no dia: incrementa fez e estoque_final
    await db.run(
      'UPDATE lancamentos SET fez = fez + ?, estoque_final = estoque_final + ? WHERE data=? AND sabor_id=?',
      [qtd, qtd, data, sabor_id]
    );
  } else {
    // Sem lançamento no dia: busca último estoque_final conhecido como estoque_inicial
    const ultimo = await db.get(
      'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND data < ? ORDER BY data DESC LIMIT 1',
      [sabor_id, data]
    );
    const estoqueInicial = ultimo ? (parseInt(ultimo.estoque_final) || 0) : 0;
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,0,0,0,?)`,
      [data, sabor_id, estoqueInicial, qtd, estoqueInicial + qtd]
    );
  }

  res.json({ ok: true, gasto_id: gasto.lastID });
}));

module.exports = router;
