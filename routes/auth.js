const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');
const { auth, hashSenha, verificarSenha, criarToken } = require('../middleware/auth');

// ─── RATE LIMIT DO LOGIN ──────────────────────
// Limitador simples em memória (por IP + usuário) para dificultar força bruta.
// Obs.: em ambiente serverless (Vercel) a memória não é compartilhada entre
// instâncias, então isso é uma mitigação best-effort, não uma garantia.
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_JANELA_MS = 15 * 60 * 1000; // 15 minutos
const tentativasLogin = new Map();

function loginBloqueado(chave) {
  const registro = tentativasLogin.get(chave);
  if (!registro) return false;
  if (Date.now() - registro.inicio > LOGIN_JANELA_MS) {
    tentativasLogin.delete(chave);
    return false;
  }
  return registro.count >= LOGIN_MAX_TENTATIVAS;
}

function registrarFalhaLogin(chave) {
  const registro = tentativasLogin.get(chave);
  if (!registro || Date.now() - registro.inicio > LOGIN_JANELA_MS) {
    tentativasLogin.set(chave, { count: 1, inicio: Date.now() });
  } else {
    registro.count++;
  }
}

function limparTentativasLogin(chave) {
  tentativasLogin.delete(chave);
}

router.post('/login', wrap(async (req, res) => {
  const { nome, senha } = req.body;
  if (!nome || !senha) return res.status(400).json({ erro: 'Preencha usuário e senha' });
  const chave = `${req.ip}|${nome.trim().toLowerCase()}`;
  if (loginBloqueado(chave))
    return res.status(429).json({ erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' });

  const usuario = await db.get('SELECT * FROM usuarios WHERE LOWER(nome) = LOWER(?)', [nome.trim()]);
  if (!usuario || !verificarSenha(senha, usuario.senha_hash)) {
    registrarFalhaLogin(chave);
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  }
  limparTentativasLogin(chave);
  const token = criarToken(usuario.id, usuario.nome);
  res.json({ token, nome: usuario.nome, deve_trocar_senha: usuario.deve_trocar_senha });
}));

router.post('/alterar-senha', auth, wrap(async (req, res) => {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 6)
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
  await db.run('UPDATE usuarios SET senha_hash=?, deve_trocar_senha=FALSE WHERE id=?',
    [hashSenha(nova_senha), req.usuario.id]);
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => {
  res.json({ ok: true }); // token é stateless, logout só limpa o cliente
});

async function seedUsuarios() {
  const count = await db.get('SELECT COUNT(*) as c FROM usuarios');
  if (parseInt(count.c) === 0) {
    for (const nome of ['Jailson', 'Gilberto', 'Carmen']) {
      await db.run('INSERT INTO usuarios (nome, senha_hash, deve_trocar_senha) VALUES (?,?,?)',
        [nome, hashSenha('12345678'), true]);
    }
    console.log('✅ Usuários padrão criados!');
  }
}

module.exports = router;
module.exports.seedUsuarios = seedUsuarios;
