const crypto = require('crypto');

// ─── JWT_SECRET ───────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    // Em produção, um segredo gerado por processo quebraria o login (cada cold
    // start invalidaria todas as sessões). Falha rápido com mensagem clara.
    throw new Error('JWT_SECRET não está definido nas variáveis de ambiente. Configure-o antes de iniciar em produção.');
  }
  // Em desenvolvimento local, gera um valor temporário só para esta execução.
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('⚠️  JWT_SECRET não definido — usando segredo temporário (sessões serão invalidadas a cada reinício). Configure JWT_SECRET no .env.');
}

function hashSenha(senha, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha, senhaHash) {
  const [salt] = senhaHash.split(':');
  return hashSenha(senha, salt) === senhaHash;
}

function criarToken(id, nome) {
  const payload = Buffer.from(`${id}|${nome}|${Date.now()}`).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarToken(token) {
  try {
    const lastDot = token.lastIndexOf('.');
    const payload = token.substring(0, lastDot);
    const sig = token.substring(lastDot + 1);
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    const [id, nome] = Buffer.from(payload, 'base64url').toString().split('|');
    return { id: parseInt(id), nome };
  } catch { return null; }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const usuario = token ? verificarToken(token) : null;
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });
  req.usuario = usuario;
  next();
}

module.exports = { auth, hashSenha, verificarSenha, criarToken, verificarToken };
