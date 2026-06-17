// Envolve um handler assíncrono e converte erros não tratados em resposta JSON 500,
// evitando repetir try/catch em cada rota.
const wrap = fn => (req, res) => fn(req, res).catch(err => res.status(500).json({ erro: err.message }));

module.exports = wrap;
