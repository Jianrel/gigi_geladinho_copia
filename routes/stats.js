const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/resumo-dia', wrap(async (req, res) => {
  let dia = req.query.data;

  // Se não informou data, pega o último dia lançado no banco
  if (!dia || dia === 'undefined') {
    const ultimo = await db.get('SELECT MAX(data) as data FROM lancamentos');
    dia = (ultimo && ultimo.data) ? ultimo.data : new Date().toISOString().slice(0, 10);
  }

  const mes = dia.substring(5, 7);
  const ano = dia.substring(0, 4);

  const lancamentos = await db.all(`
    SELECT l.*, s.nome as sabor_nome, s.preco, s.categoria,
      (CASE WHEN COALESCE(l.quantidade,0) > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id WHERE l.data = ?`, [dia]);

  const totalVendidos = lancamentos.reduce((a,l) => a + (parseFloat(l.vendidos) || 0), 0);
  const receita = lancamentos.reduce((a,l) => a + ((parseFloat(l.vendidos) || 0) * parseFloat(l.preco)), 0);
  const totalProduzidos = lancamentos.reduce((a,l) => a + (l.fez || 0), 0);
  const totalPerdas = lancamentos.reduce((a,l) => a + (l.furou || 0), 0);

  const statsMes = await db.get(`
    SELECT
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      COUNT(DISTINCT l.data) as dias,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco) as receita
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE SUBSTRING(l.data, 1, 7) = ?`, [`${ano}-${mes}`]);

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

    let dias;
    try {
      dias = await db.all(`
        SELECT l.data,
          SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
          SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
          SUM(l.fez) as produzidos, SUM(l.furou) as perdas
        FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
        WHERE SUBSTRING(l.data, 1, 7) = ?
        GROUP BY l.data ORDER BY l.data`, [anoMes]);
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
        WHERE SUBSTRING(l.data, 1, 7) = ?
        GROUP BY s.id ORDER BY vendidos DESC`, [anoMes]);
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
  res.json(await db.all(`
    SELECT s.id, s.nome, s.categoria, s.preco,
      COALESCE(l.estoque_final, 0) as estoque_atual, l.data as ultima_data
    FROM sabores s
    LEFT JOIN (
      SELECT DISTINCT ON (sabor_id) sabor_id, estoque_final, data
      FROM lancamentos
      ORDER BY sabor_id, data DESC
    ) l ON s.id = l.sabor_id
    WHERE s.ativo = 1
    ORDER BY s.nome`));
}));

router.get('/evolucao-mensal', wrap(async (req, res) => {
  res.json(await db.all(`
    SELECT TO_CHAR(l.data::date, 'YYYY-MM') as mes,
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
      SUM(l.fez) as produzidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
    GROUP BY TO_CHAR(l.data::date, 'YYYY-MM') ORDER BY mes`));
}));

router.get('/resumo-semanal', wrap(async (req, res) => {
  let ref = req.query.data ? new Date(req.query.data + 'T12:00:00') : new Date();
  const day = ref.getDay();
  // Calcular segunda-feira da semana (day 0=dom, 1=seg)
  const diffToMon = day === 0 ? -6 : 1 - day;
  const seg = new Date(ref);
  seg.setDate(ref.getDate() + diffToMon);
  const sex = new Date(seg);
  sex.setDate(seg.getDate() + 4);

  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dataInicio = fmtDate(seg);
  const dataFim = fmtDate(sex);

  const result = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END), 0) as vendidos,
      COUNT(DISTINCT l.data) as dias
    FROM lancamentos l
    WHERE l.data >= ? AND l.data <= ?`, [dataInicio, dataFim]);

  const vendidos = parseInt(result?.vendidos || 0);
  const custoUnit = parseFloat(process.env.CUSTO_FORNECEDOR || 0);

  const porDia = await db.all(`
    SELECT l.data,
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco) as receita
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE l.data >= ? AND l.data <= ?
    GROUP BY l.data ORDER BY l.data`, [dataInicio, dataFim]);

  const receita = porDia.reduce((a, d) => a + (parseFloat(d.receita) || 0), 0);

  res.json({
    dataInicio,
    dataFim,
    vendidos,
    custoFornecedor: vendidos * custoUnit,
    receita,
    lucro: receita - (vendidos * custoUnit),
    dias: parseInt(result?.dias || 0),
    porDia
  });
}));

module.exports = router;
