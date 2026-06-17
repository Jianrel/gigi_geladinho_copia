// Executa UMA VEZ para criar a tabela usuarios e os 3 usuários no banco de produção
require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000
});

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('Conectando ao banco...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      deve_trocar_senha BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  console.log('✅ Tabela usuarios OK');

  const { rows } = await pool.query('SELECT COUNT(*) as c FROM usuarios');
  if (parseInt(rows[0].c) > 0) {
    console.log('ℹ️  Usuários já existem, nada a fazer.');
    await pool.end();
    return;
  }

  for (const nome of ['Jailson', 'Gilberto', 'Carmen']) {
    await pool.query(
      'INSERT INTO usuarios (nome, senha_hash, deve_trocar_senha) VALUES ($1, $2, $3)',
      [nome, hashSenha('12345678'), true]
    );
    console.log(`  ✅ ${nome} criado`);
  }

  console.log('\n✅ Pronto! Login funcionando em produção.');
  await pool.end();
}

main().catch(e => { console.error('Erro:', e.message); pool.end(); process.exit(1); });
