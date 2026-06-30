const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin hardcodeado ──────────────────────────────────────────
const ADMIN_EMAIL    = 'lmariostorm@gmail.com';
const ADMIN_PASSWORD = '12345678';

// ── Datos en memoria ───────────────────────────────────────────
// Usuarios registrados para votar
let users = [];

// Candidatos (perfiles de IG a los que se puede votar)
let candidates = [
  {
    id: 1,
    igUrl: 'https://www.instagram.com/smd_slax/',
    username: 'smd_slax',
    label: 'smd_slax',
    votes: 0,
    addedBy: 'admin'
  },
  {
    id: 2,
    igUrl: 'https://www.instagram.com/samuel_algenis/',
    username: 'samuel_algenis',
    label: 'samuel_algenis',
    votes: 0,
    addedBy: 'admin'
  }
];

let nextCandidateId = 3;
let nextUserId = 1;

// ── Auth ────────────────────────────────────────────────────────

// Registro
app.post('/api/register', (req, res) => {
  const { email, password, igUrl } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  // No permitir registrar el email del admin
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return res.status(400).json({ error: 'Ese email no está disponible' });
  }

  const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'Ese email ya está registrado' });
  }

  const user = {
    id: nextUserId++,
    email,
    password,
    igUrl: igUrl || null,
    votedFor: [],
    registeredAt: new Date().toISOString()
  };

  users.push(user);

  // Si proporcionó link de IG, agregarlo como candidato
  if (igUrl) {
    const parsed = parseIg(igUrl);
    if (parsed) {
      const dupCand = candidates.find(
        c => c.username.toLowerCase() === parsed.username.toLowerCase()
      );
      if (!dupCand) {
        candidates.push({
          id: nextCandidateId++,
          igUrl: parsed.url,
          username: parsed.username,
          label: parsed.username,
          votes: 0,
          addedBy: email
        });
      }
    }
  }

  res.status(201).json({ ok: true, userId: user.id });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  // Admin
  if (
    email.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
    password === ADMIN_PASSWORD
  ) {
    return res.json({ ok: true, role: 'admin', userId: 0, email: ADMIN_EMAIL });
  }

  const user = users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  res.json({ ok: true, role: 'user', userId: user.id, email: user.email, votedFor: user.votedFor });
});

// ── Candidatos ─────────────────────────────────────────────────

app.get('/api/candidates', (req, res) => {
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  res.json(sorted);
});

// Agregar candidato (requiere estar autenticado)
app.post('/api/candidates', (req, res) => {
  const { igUrl, label, userId } = req.body;

  if (!igUrl) return res.status(400).json({ error: 'igUrl requerido' });

  const parsed = parseIg(igUrl);
  if (!parsed) return res.status(400).json({ error: 'URL de Instagram inválida' });

  const dup = candidates.find(
    c => c.username.toLowerCase() === parsed.username.toLowerCase()
  );
  if (dup) return res.status(409).json({ error: 'Ese perfil ya está en la lista' });

  const user = users.find(u => u.id === userId);

  candidates.push({
    id: nextCandidateId++,
    igUrl: parsed.url,
    username: parsed.username,
    label: label || parsed.username,
    votes: 0,
    addedBy: user ? user.email : 'desconocido'
  });

  res.status(201).json({ ok: true });
});

// Votar
app.post('/api/candidates/:id/vote', (req, res) => {
  const candId  = parseInt(req.params.id);
  const { userId } = req.body;

  const candidate = candidates.find(c => c.id === candId);
  if (!candidate) return res.status(404).json({ error: 'Candidato no encontrado' });

  // Admin no vota
  if (userId === 0) return res.status(403).json({ error: 'El admin no puede votar' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Usuario no válido' });

  if (user.votedFor.includes(candId)) {
    return res.status(409).json({ error: 'Ya votaste por este perfil' });
  }

  candidate.votes++;
  user.votedFor.push(candId);

  res.json({ votes: candidate.votes });
});

// Eliminar candidato
app.delete('/api/candidates/:id', (req, res) => {
  const id  = parseInt(req.params.id);
  const idx = candidates.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  candidates.splice(idx, 1);
  res.json({ ok: true });
});

// Reiniciar votos
app.post('/api/reset', (req, res) => {
  candidates = candidates.map(c => ({ ...c, votes: 0 }));
  users      = users.map(u => ({ ...u, votedFor: [] }));
  res.json({ ok: true });
});

// ── Admin: ver todos los usuarios ──────────────────────────────
app.get('/api/admin/users', (req, res) => {
  const { email, password } = req.query;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  res.json(users);
});

// ── Helpers ────────────────────────────────────────────────────
function parseIg(raw) {
  if (!raw) return null;
  raw = raw.trim();
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('instagram.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const username = parts[0];
    if (!username) return null;
    return { url: `https://www.instagram.com/${username}/`, username };
  } catch {
    const clean = raw.replace('@', '').trim();
    if (!clean) return null;
    return { url: `https://www.instagram.com/${clean}/`, username: clean };
  }
}

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
