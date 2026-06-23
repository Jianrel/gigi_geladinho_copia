const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.post('/ajustar', wrap(async (req, res) => {
  const { sabor_id, nova_quantidade, data, ponto_id } = req.body;
  const pontoIdFinal = ponto_id || 1;
  const agora = new Date();
  const diaLocal = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
  const dia = data || diaLocal;
  const qty = Math.max(0, parseInt(nova_quantidade) || 0);

  const existing = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=? AND ponto_id=?', [dia, sabor_id, pontoIdFinal]
  );

  if (existing) {
    await db.run(
      'UPDATE lancamentos SET estoque_final=? WHERE data=? AND sabor_id=? AND ponto_id=?',
      [qty, dia, sabor_id, pontoIdFinal]
    );
  } else {
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,0,0,0,0,?)`,
      [dia, sabor_id, pontoIdFinal, qty, qty]
    );
  }
  res.json({ ok: true, sabor_id, nova_quantidade: qty, data: dia, ponto_id: pontoIdFinal });
}));

module.exports = router;
