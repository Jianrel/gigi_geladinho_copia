require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Criar tabela pontos_venda
    await client.query(`
      CREATE TABLE IF NOT EXISTS pontos_venda (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Seed pontos de venda
    await client.query(`INSERT INTO pontos_venda (nome) VALUES ('Gigi') ON CONFLICT (nome) DO NOTHING`);
    await client.query(`INSERT INTO pontos_venda (nome) VALUES ('Jajá') ON CONFLICT (nome) DO NOTHING`);

    // 3. Criar tabela transferencias_estoque
    await client.query(`
      CREATE TABLE IF NOT EXISTS transferencias_estoque (
        id SERIAL PRIMARY KEY,
        data TEXT NOT NULL,
        sabor_id INTEGER NOT NULL REFERENCES sabores(id),
        ponto_origem_id INTEGER NOT NULL REFERENCES pontos_venda(id),
        ponto_destino_id INTEGER NOT NULL REFERENCES pontos_venda(id),
        quantidade INTEGER NOT NULL CHECK (quantidade > 0),
        observacao TEXT,
        usuario TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (ponto_origem_id != ponto_destino_id)
      )
    `);

    // 4. Adicionar ponto_id em tabelas existentes (DEFAULT 1 = Gigi)
    const tables = ['lancamentos', 'gastos_producao', 'fluxo_caixa_avulso', 'pedidos'];
    for (const table of tables) {
      const col = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='ponto_id'`,
        [table]
      );
      if (col.rows.length === 0) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN ponto_id INTEGER NOT NULL DEFAULT 1 REFERENCES pontos_venda(id)`);
        console.log(`  ✅ Coluna ponto_id adicionada em ${table}`);
      } else {
        console.log(`  ⏭️  Coluna ponto_id já existe em ${table}`);
      }
    }

    // 5. Atualizar constraint UNIQUE de lancamentos
    await client.query('ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_data_sabor_id_key');
    await client.query('ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_data_sabor_ponto_key');
    await client.query('ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_data_sabor_ponto_key UNIQUE(data, sabor_id, ponto_id)');
    console.log('  ✅ Constraint UNIQUE(data, sabor_id, ponto_id) criada em lancamentos');

    await client.query('COMMIT');
    console.log('\n✅ Migração concluída com sucesso!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração (rollback feito):', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
