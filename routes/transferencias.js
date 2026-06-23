const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.post('/', wrap(async (req, res) => {
  const { data, sabor_id, ponto_origem_id, ponto_destino_id, quantidade, observacao } = req.body;
  if (!data || !sabor_id || !ponto_origem_id || !ponto_destino_id || !quantidade)
    return res.status(400).json({ erro: 'Dados incompletos' });
  if (ponto_origem_id === ponto_destino_id)
    return res.status(400).json({ erro: 'Origem e destino devem ser diferentes' });

  const qty = Math.max(0, parseInt(quantidade) || 0);
  if (qty <= 0) return res.status(400).json({ erro: 'Quantidade deve ser maior que zero' });

  // Verificar estoque disponível na origem
  const ultimoOrigem = await db.get(
    'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND ponto_id=? ORDER BY data DESC LIMIT 1',
    [sabor_id, ponto_origem_id]
  );
  const estoqueOrigem = ultimoOrigem ? (parseInt(ultimoOrigem.estoque_final) || 0) : 0;
  if (estoqueOrigem < qty)
    return res.status(400).json({ erro: `Estoque insuficiente. Disponível: ${estoqueOrigem}` });

  const usuario = req.usuario ? req.usuario.nome : null;

  // 1. Registrar a transferência
  const t = await db.run(
    `INSERT INTO transferencias_estoque (data, sabor_id, ponto_origem_id, ponto_destino_id, quantidade, observacao, usuario)
     VALUES (?,?,?,?,?,?,?)`,
    [data, sabor_id, ponto_origem_id, ponto_destino_id, qty, observacao || null, usuario]
  );

  // 2. Atualizar ORIGEM — reduzir estoque
  const existOrigem = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=? AND ponto_id=?',
    [data, sabor_id, ponto_origem_id]
  );
  if (existOrigem) {
    await db.run(
      'UPDATE lancamentos SET estoque_final = GREATEST(0, estoque_final - ?) WHERE data=? AND sabor_id=? AND ponto_id=?',
      [qty, data, sabor_id, ponto_origem_id]
    );
  } else {
    const prev = await db.get(
      'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND ponto_id=? AND data < ? ORDER BY data DESC LIMIT 1',
      [sabor_id, ponto_origem_id, data]
    );
    const ei = prev ? (parseInt(prev.estoque_final) || 0) : 0;
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,0,0,0,0,?)`,
      [data, sabor_id, ponto_origem_id, ei, Math.max(0, ei - qty)]
    );
  }

  // 3. Atualizar DESTINO — aumentar estoque
  const existDestino = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=? AND ponto_id=?',
    [data, sabor_id, ponto_destino_id]
  );
  if (existDestino) {
    await db.run(
      'UPDATE lancamentos SET estoque_inicial = estoque_inicial + ?, estoque_final = estoque_final + ? WHERE data=? AND sabor_id=? AND ponto_id=?',
      [qty, qty, data, sabor_id, ponto_destino_id]
    );
  } else {
    const prevDest = await db.get(
      'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND ponto_id=? AND data < ? ORDER BY data DESC LIMIT 1',
      [sabor_id, ponto_destino_id, data]
    );
    const eiDest = prevDest ? (parseInt(prevDest.estoque_final) || 0) : 0;
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,0,0,0,0,?)`,
      [data, sabor_id, ponto_destino_id, eiDest + qty, eiDest + qty]
    );
  }

  res.json({ ok: true, transferencia_id: t.lastID });
}));

router.get('/', wrap(async (req, res) => {
  const { mes, ano, ponto_id } = req.query;
  let sql = `SELECT t.*, s.nome as sabor_nome,
    po.nome as ponto_origem_nome, pd.nome as ponto_destino_nome
    FROM transferencias_estoque t
    JOIN sabores s ON t.sabor_id = s.id
    JOIN pontos_venda po ON t.ponto_origem_id = po.id
    JOIN pontos_venda pd ON t.ponto_destino_id = pd.id`;
  const p = [];
  const wheres = [];

  if (mes && ano) {
    wheres.push("EXTRACT(MONTH FROM t.data::date) = ? AND EXTRACT(YEAR FROM t.data::date) = ?");
    p.push(parseInt(mes), parseInt(ano));
  }
  if (ponto_id && ponto_id !== 'todos') {
    wheres.push("(t.ponto_origem_id = ? OR t.ponto_destino_id = ?)");
    p.push(parseInt(ponto_id), parseInt(ponto_id));
  }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY t.criado_em DESC LIMIT 200';

  res.json(await db.all(sql, p));
}));

module.exports = router;
