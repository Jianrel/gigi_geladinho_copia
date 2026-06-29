const app = require('../server.js');
const { inicializar } = require('../database');
const authRoutes = require('../routes/auth');

let dbPronto = false;
const initPromise = inicializar().then(async () => {
  await authRoutes.seedUsuarios();
  dbPronto = true;
}).catch(err => console.error('Erro ao inicializar DB:', err));

module.exports = async (req, res) => {
  if (!dbPronto) await initPromise;
  return app(req, res);
};
