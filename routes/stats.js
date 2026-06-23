const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/resumo-dia', wrap(async (req, res) => {
  let dia = req.query.data;
  const ponto_id = req.query.ponto_id;
  const filtroPonto = ponto_id && ponto_id !== 'todos';

  if (!dia || dia === 'undefined') {
    const pontoWhere = filtroPonto ? ' WHERE ponto_id = ?' : '';
    const params = filtroPonto ? [parseInt(ponto_id)] : [];
    const ultimo = await db.get('SELECT MAX(data) as data FROM lancamentos' + pontoWhere, params);
    dia = (ultimo && ultimo.data) ? ultimo.data : new Date().toISOString().slice(0, 10);
  }

  const mes = dia.substring(5, 7);
  const ano = dia.substring(0, 4);

  const pontoWhereDia = filtroPonto ? ' AND l.ponto_id = ?' : '';
  const paramsDia = filtroPonto ? [dia, parseInt(ponto_id)] : [dia];

  const lancamentos = await db.all(`
    SELECT l.*, s.nome as sabor_nome, s.preco, s.categoria,
      (CASE WHEN COALESCE(l.quantidade,0) > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id WHERE l.data = ?${pontoWhereDia}`, paramsDia);

  const totalVendidos = lancamentos.reduce((a,l) => a + (parseFloat(l.vendidos) || 0), 0);
  const receita = lancamentos.reduce((a,l) => a + ((parseFloat(l.vendidos) || 0) * parseFloat(l.preco)), 0);
  const totalProduzidos = lancamentos.reduce((a,l) => a + (l.fez || 0), 0);
  const totalPerdas = lancamentos.reduce((a,l) => a + (l.furou || 0), 0);

  const pontoWhereMes = filtroPonto ? ' AND l.ponto_id = ?' : '';
  const paramsMes = filtroPonto ? [`${ano}-${mes}`, parseInt(ponto_id)] : [`${ano}-${mes}`];

  const statsMes = await db.get(`
    SELECT
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      COUNT(DISTINCT l.data) as dias,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco) as receita
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE SUBSTRING(l.data, 1, 7) = ?${pontoWhereMes}`, paramsMes);

  res.json({
    data: dia,
    totalVendidos,
    receita,
    totalProduzidos,
    totalPerdas,
    vendidosMes: parseFloat(statsMes?.vendidos || 0),
    receitaMes: parseFloat(statsMes?.receita || 0),
    diasTrabalhados: parseInt(statsMes?.dias || 0),
    lancamentos
  });
}));

router.get('/resumo-mes', async (req, res) => {
  try {
    const agora = new Date();
    const m = String(req.query.mes || agora.getMonth()+1).padStart(2,'0');
    const a = String(req.query.ano || agora.getFullYear());
    const anoMes = `${a}-${m}`;
    const ponto_id = req.query.ponto_id;
    const filtroPonto = ponto_id && ponto_id !== 'todos';
    const pontoWhere = filtroPonto ? ' AND l.ponto_id = ?' : '';
    const extraParams = filtroPonto ? [parseInt(ponto_id)] : [];

    let dias;
    try {
      dias = await db.all(`
        SELECT l.data,
          SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
          SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
          SUM(l.fez) as produzidos, SUM(l.furou) as perdas
        FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
        WHERE SUBSTRING(l.data, 1, 7) = ?${pontoWhere}
        GROUP BY l.data ORDER BY l.data`, [anoMes, ...extraParams]);
    } catch(e) {
      return res.status(500).json({ erro: 'query dias: ' + e.message });
    }

    let porSabor;
    try {
      porSabor = await db.all(`
        SELECT s.nome, s.categoria,
          SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
          SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita
        FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
        WHERE SUBSTRING(l.data, 1, 7) = ?${pontoWhere}
        GROUP BY s.id ORDER BY vendidos DESC`, [anoMes, ...extraParams]);
    } catch(e) {
      return res.status(500).json({ erro: 'query porSabor: ' + e.message });
    }

    const totais = dias.reduce((acc,d) => ({
      vendidos:   acc.vendidos   + Math.max(0, Number(d.vendidos)  || 0),
      receita:    acc.receita    + Math.max(0, Number(d.receita)   || 0),
      produzidos: acc.produzidos + Math.max(0, Number(d.produzidos)|| 0),
      perdas:     acc.perdas     + Math.max(0, Number(d.perdas)    || 0)
    }), { vendidos:0, receita:0, produzidos:0, perdas:0 });

    res.json({ mes: m, ano: a, dias, porSabor, totais, _v: 3 });
  } catch(e) {
    res.status(500).json({ erro: 'geral: ' + e.message });
  }
});

router.get('/estoque-atual', wrap(async (req, res) => {
  const ponto_id = req.query.ponto_id;
  const filtroPonto = ponto_id && ponto_id !== 'todos';

  if (filtroPonto) {
    res.json(await db.all(`
      SELECT s.id, s.nome, s.categoria, s.preco,
        COALESCE(l.estoque_final, 0) as estoque_atual, l.data as ultima_data
      FROM sabores s
      LEFT JOIN (
        SELECT DISTINCT ON (sabor_id) sabor_id, estoque_final, data
        FROM lancamentos WHERE ponto_id = ?
        ORDER BY sabor_id, data DESC
      ) l ON s.id = l.sabor_id
      WHERE s.ativo = 1
      ORDER BY s.nome`, [parseInt(ponto_id)]));
  } else {
    // Visão consolidada: soma estoque de todos os pontos
    res.json(await db.all(`
      SELECT s.id, s.nome, s.categoria, s.preco,
        COALESCE(SUM(l.estoque_final), 0) as estoque_atual,
        MAX(l.data) as ultima_data
      FROM sabores s
      LEFT JOIN (
        SELECT DISTINCT ON (sabor_id, ponto_id) sabor_id, ponto_id, estoque_final, data
        FROM lancamentos
        ORDER BY sabor_id, ponto_id, data DESC
      ) l ON s.id = l.sabor_id
      WHERE s.ativo = 1
      GROUP BY s.id, s.nome, s.categoria, s.preco
      ORDER BY s.nome`));
  }
}));

router.get('/evolucao-mensal', wrap(async (req, res) => {
  const ponto_id = req.query.ponto_id;
  const filtroPonto = ponto_id && ponto_id !== 'todos';
  const pontoWhere = filtroPonto ? ' WHERE l.ponto_id = ?' : '';
  const params = filtroPonto ? [parseInt(ponto_id)] : [];

  res.json(await db.all(`
    SELECT TO_CHAR(l.data::date, 'YYYY-MM') as mes,
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
      SUM(l.fez) as produzidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id${pontoWhere}
    GROUP BY TO_CHAR(l.data::date, 'YYYY-MM') ORDER BY mes`, params));
}));

module.exports = router;
