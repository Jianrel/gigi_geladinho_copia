const express = require('express');
const path = require('path');
const { inicializar } = require('./database');
const { auth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ROTAS PÚBLICAS (sem autenticação) ────────
app.use('/api', authRoutes);                       // login, alterar-senha (protegida internamente), logout
app.use('/api', require('./routes/publico'));       // sabores-publico, pedido-webhook

// ─── MIDDLEWARE AUTH (protege todas as rotas abaixo) ──
app.use('/api', auth);

// ─── ROTAS PROTEGIDAS ──────────────────────────
app.use('/api/sabores', require('./routes/sabores'));
app.use('/api/ingredientes', require('./routes/ingredientes'));
app.use('/api/receitas', require('./routes/receitas'));
app.use('/api/lancamentos', require('./routes/lancamentos'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/producao', require('./routes/producao'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/estoque', require('./routes/estoque'));
app.use('/api/importar', require('./routes/importacao'));
app.use('/api/fluxo-caixa', require('./routes/fluxoCaixa'));
app.use('/api/pedidos', require('./routes/pedidos'));

// ─── EXPORTAR PARA VERCEL ─────────────────────────
// Em ambiente local, você ainda pode rodar com 'node server.js'
if (require.main === module) {
  inicializar().then(async () => {
    await authRoutes.seedUsuarios();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor local rodando em http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Erro ao inicializar:', err);
    process.exit(1);
  });
}

module.exports = app;
