const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.post('/', wrap(async (req, res) => {
  const { lancamentos, ponto_id } = req.body;
  if (!lancamentos?.length) return res.status(400).json({ erro: 'Sem dados' });
  const pontoIdFinal = ponto_id || 1;
  let ok = 0, erros = 0;
  for (const item of lancamentos) {
    try {
      await db.run(`INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,voltaram,estoque_final,quantidade)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(data,sabor_id,ponto_id) DO UPDATE SET
          estoque_inicial=excluded.estoque_inicial,fez=excluded.fez,
          furou=excluded.furou,voltaram=excluded.voltaram,
          estoque_final=excluded.estoque_final,quantidade=excluded.quantidade`,
        [item.data, item.sabor_id, pontoIdFinal, item.estoque_inicial, item.fez, item.furou, item.voltaram, item.estoque_final, item.quantidade ?? 0]);
      ok++;
    } catch { erros++; }
  }
  res.json({ ok, erros });
}));

module.exports = router;
