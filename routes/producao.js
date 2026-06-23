const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.post('/', wrap(async (req, res) => {
  const { data, sabor_id, descricao, valor, geladinhos_produzidos, ponto_id } = req.body;
  if (!data || !sabor_id || !geladinhos_produzidos) return res.status(400).json({ erro: 'Dados incompletos' });
  const qtd = Math.max(0, parseInt(geladinhos_produzidos) || 0);
  const pontoIdFinal = ponto_id || 1;

  const gasto = await db.run(
    'INSERT INTO gastos_producao (data,sabor_id,descricao,valor,geladinhos_produzidos,ponto_id) VALUES (?,?,?,?,?,?)',
    [data, sabor_id, descricao, valor, qtd, pontoIdFinal]
  );

  const existing = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=? AND ponto_id=?', [data, sabor_id, pontoIdFinal]
  );

  if (existing) {
    await db.run(
      'UPDATE lancamentos SET fez = fez + ?, estoque_final = estoque_final + ? WHERE data=? AND sabor_id=? AND ponto_id=?',
      [qtd, qtd, data, sabor_id, pontoIdFinal]
    );
  } else {
    const ultimo = await db.get(
      'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND ponto_id=? AND data < ? ORDER BY data DESC LIMIT 1',
      [sabor_id, pontoIdFinal, data]
    );
    const estoqueInicial = ultimo ? (parseInt(ultimo.estoque_final) || 0) : 0;
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,?,0,0,0,?)`,
      [data, sabor_id, pontoIdFinal, estoqueInicial, qtd, estoqueInicial + qtd]
    );
  }

  res.json({ ok: true, gasto_id: gasto.lastID });
}));

module.exports = router;
