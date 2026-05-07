const sqlite3 = require('sqlite3').verbose();
const { db: pg } = require('./database');

async function migrar() {
  console.log('🚀 Iniciando migração de dados históricos...');

  const sqliteDb = new sqlite3.Database('gigi_estoque.db');

  const getSqlite = (sql, params = []) => new Promise((res, rej) => sqliteDb.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

  try {
    // 1. Migrar Lançamentos Diários
    console.log('📦 Migrando lançamentos diários...');
    const lancamentos = await getSqlite('SELECT * FROM lancamentos');
    console.log(`Encontrados ${lancamentos.length} lançamentos.`);

    for (const l of lancamentos) {
      // Como os IDs dos sabores podem ter mudado, buscamos pelo nome original
      const saborOriginal = await getSqlite('SELECT nome FROM sabores WHERE id = ?', [l.sabor_id]);
      if (saborOriginal.length > 0) {
        const saborNovo = await pg.get('SELECT id FROM sabores WHERE nome = ?', [saborOriginal[0].nome]);
        if (saborNovo) {
          await pg.run(`
            INSERT INTO lancamentos (data, sabor_id, estoque_inicial, fez, furou, voltaram, estoque_final, quantidade)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (data, sabor_id) DO NOTHING
          `, [l.data, saborNovo.id, l.estoque_inicial, l.fez, l.furou, l.voltaram, l.estoque_final, l.quantidade || 0]);
        }
      }
    }
    console.log('✅ Lançamentos migrados!');

    // 2. Migrar Gastos de Produção / Histórico
    console.log('💰 Migrando histórico de gastos...');
    const gastos = await getSqlite('SELECT * FROM gastos_producao');
    console.log(`Encontrados ${gastos.length} registros de gastos.`);

    for (const g of gastos) {
      let novoSaborId = null;
      if (g.sabor_id) {
        const saborOriginal = await getSqlite('SELECT nome FROM sabores WHERE id = ?', [g.sabor_id]);
        if (saborOriginal.length > 0) {
          const saborNovo = await pg.get('SELECT id FROM sabores WHERE nome = ?', [saborOriginal[0].nome]);
          if (saborNovo) novoSaborId = saborNovo.id;
        }
      }

      await pg.run(`
        INSERT INTO gastos_producao (data, sabor_id, descricao, valor, geladinhos_produzidos)
        VALUES (?, ?, ?, ?, ?)
      `, [g.data, novoSaborId, g.descricao, g.valor, g.geladinhos_produzidos || 0]);
    }
    console.log('✅ Histórico de gastos migrado!');

    console.log('\n✨ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
  } finally {
    sqliteDb.close();
    process.exit(0);
  }
}

migrar();
