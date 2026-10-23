const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('supabase.com') || process.env.DATABASE_URL.includes('pooler') || !process.env.DATABASE_URL.includes('localhost')) 
    ? { rejectUnauthorized: false } 
    : false
});

class Database {
  _replaceParams(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
  }

  async run(sql, params = []) {
    let pgSql = this._replaceParams(sql);
    
    // Adicionar RETURNING id para comandos INSERT automaticamente para simular lastID
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING ID')) {
      pgSql += ' RETURNING id';
    }

    const res = await pool.query(pgSql, params);
    let lastID = null;
    if (res.rows && res.rows.length > 0 && res.rows[0].id) {
      lastID = res.rows[0].id;
    }
    return { lastID, changes: res.rowCount };
  }

  async all(sql, params = []) {
    const pgSql = this._replaceParams(sql);
    const res = await pool.query(pgSql, params);
    return res.rows;
  }

  async get(sql, params = []) {
    const pgSql = this._replaceParams(sql);
    const res = await pool.query(pgSql, params);
    return res.rows[0];
  }

  async exec(sql) {
    return pool.query(sql);
  }
}

const db = new Database();

async function inicializar() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sabores (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      categoria TEXT NOT NULL,
      preco REAL NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      rendimento_receita INTEGER NOT NULL DEFAULT 20,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lancamentos (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      estoque_inicial INTEGER NOT NULL DEFAULT 0,
      fez INTEGER NOT NULL DEFAULT 0,
      furou INTEGER NOT NULL DEFAULT 0,
      voltaram INTEGER NOT NULL DEFAULT 0,
      estoque_final INTEGER NOT NULL DEFAULT 0,
      quantidade INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(data, sabor_id)
    );

    CREATE TABLE IF NOT EXISTS ingredientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      unidade TEXT NOT NULL,
      preco_unitario REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gastos_producao (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      sabor_id INTEGER REFERENCES sabores(id),
      descricao TEXT,
      valor REAL NOT NULL DEFAULT 0,
      geladinhos_produzidos INTEGER DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS receita_ingredientes (
      id SERIAL PRIMARY KEY,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      quantidade REAL NOT NULL DEFAULT 0,
      UNIQUE(sabor_id, ingrediente_id)
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      deve_trocar_senha BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS fluxo_caixa_avulso (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
      categoria TEXT,
      valor REAL NOT NULL DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente_nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      itens TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_producao', 'entregue', 'cancelado')),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Fluxo de caixa: previsto x realizado, vínculo com pedido, categorias e saldo inicial
  await db.exec(`
    ALTER TABLE fluxo_caixa_avulso ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'realizado'
      CHECK (status IN ('previsto', 'realizado'));
    ALTER TABLE fluxo_caixa_avulso ADD COLUMN IF NOT EXISTS data_prevista TEXT;
    ALTER TABLE fluxo_caixa_avulso ADD COLUMN IF NOT EXISTS valor_previsto REAL;
    ALTER TABLE fluxo_caixa_avulso ADD COLUMN IF NOT EXISTS pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL;

    -- produção pela receita não entra no fluxo de caixa (os ingredientes já são lançados nos gastos do dia)
    ALTER TABLE gastos_producao ADD COLUMN IF NOT EXISTS no_fluxo BOOLEAN NOT NULL DEFAULT TRUE;

    -- id da mensagem de enquete (WhatsApp) enviada à Gigi para atualizar o status do pedido
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS wa_enquete_id TEXT;

    CREATE TABLE IF NOT EXISTS fluxo_categorias (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  const cats = await db.get('SELECT COUNT(*) as c FROM fluxo_categorias');
  if (parseInt(cats.c) === 0) {
    const base = ['Vendas', 'Nubank', 'Mercado Pago', 'Ingredientes/Fornecedor', 'Embalagem', 'Produção',
      'Supermercado', 'Combustível', 'Entrega', 'Gás', 'Energia', 'Água', 'Internet',
      'Despesas fixas', 'Impostos (DAS)', 'Outros'];
    for (const nome of base) {
      await db.run('INSERT INTO fluxo_categorias (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING', [nome]);
    }
  }
  // categorias já usadas em lançamentos (inclusive as que antes ficavam só no navegador)
  await db.exec(`
    INSERT INTO fluxo_categorias (nome)
    SELECT DISTINCT categoria FROM fluxo_caixa_avulso WHERE categoria IS NOT NULL AND categoria NOT IN ('', '__nova__')
    ON CONFLICT (nome) DO NOTHING
  `);

  const row = await db.get('SELECT COUNT(*) as c FROM sabores');
  if (parseInt(row.c) === 0) {
    const sabores = [
      ['Abacate','fruta',6],['Abacaxi','fruta',6],['Açaí','fruta',6],
      ['Buriti','fruta',6],['Coco','fruta',6],['Coco Queimado','fruta',6],
      ['Cupuaçu','fruta',6],['Maracujá','fruta',6],['Milho Verde','fruta',6],
      ['Morango','fruta',6],['Uva','fruta',6],
      ['Amendoim','doce_especial',6],['Brigadeiro','doce_especial',6],
      ['Maracujá com Nutella','doce_especial',6],['Morango com Nutella','doce_especial',6],
      ['Mousse de Limão','doce_especial',6],['Ninho com Nutella','doce_especial',6],
      ['Ninho com Morango','doce_especial',6],['Oreo','doce_especial',6],
      ['Prestígio','doce_especial',6],['Pudim','doce_especial',6],
      ['Zero Lactose Coco','zero_lactose',7],['Zero Lactose Morango','zero_lactose',7],
    ];
    for (const [nome, cat, preco] of sabores) {
      await db.run('INSERT INTO sabores (nome, categoria, preco) VALUES (?,?,?)', [nome, cat, preco]);
    }
    console.log('✅ Sabores base cadastrados!');
  }

  console.log('✅ Banco de dados Postgres pronto!');
}

module.exports = { db, inicializar };
