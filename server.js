const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin ──────────────────────────────────────────────────────
const ADMIN_EMAIL    = 'lmariostorm@gmail.com';
const ADMIN_PASSWORD = '12345678';

// ── Datos ──────────────────────────────────────────────────────
let pendingUsers = [];   // esperando aprobación
let rejectedEmails = []; // rechazados
let users        = [];   // aprobados / activos
let candidates   = [
  { id:1, igUrl:'https://www.instagram.com/smd_slax/',      username:'smd_slax',      label:'smd_slax',      votes:0, addedBy:'admin' },
  { id:2, igUrl:'https://www.instagram.com/samuel_algenis/', username:'samuel_algenis', label:'samuel_algenis', votes:0, addedBy:'admin' }
];
let nextCandId  = 3;
let nextUserId  = 1;
let nextPendId  = 1;

// ── Helpers ────────────────────────────────────────────────────
function parseIg(raw) {
  if (!raw) return null;
  raw = raw.trim();
  try {
    const u     = new URL(raw);
    if (!u.hostname.includes('instagram.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts[0]) return null;
    return { url:`https://www.instagram.com/${parts[0]}/`, username:parts[0] };
  } catch {
    const clean = raw.replace('@','').trim();
    if (!clean) return null;
    return { url:`https://www.instagram.com/${clean}/`, username:clean };
  }
}

function adminAuth(req, res) {
  const email = req.query.email || req.body.adminEmail;
  const pass  = req.query.password || req.body.adminPassword;
  if (email !== ADMIN_EMAIL || pass !== ADMIN_PASSWORD) {
    res.status(403).json({ error:'No autorizado' });
    return false;
  }
  return true;
}

// ── Auth ────────────────────────────────────────────────────────

// Registro → queda pendiente
app.post('/api/register', (req, res) => {
  const { email, password, igUrl } = req.body;
  if (!email || !password) return res.status(400).json({ error:'Email y contraseña requeridos' });
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return res.status(400).json({ error:'Email no disponible' });

  const inUsers   = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  const inPending = pendingUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (inUsers || inPending) return res.status(409).json({ error:'Ese email ya está registrado o pendiente' });

  pendingUsers.push({
    id: nextPendId++,
    email,
    password,
    igUrl: igUrl || null,
    requestedAt: new Date().toISOString()
  });

  res.status(201).json({ ok:true, status:'pending' });
});

// Consultar estado del registro (el cliente hace polling)
app.get('/api/register/status', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error:'email requerido' });

  const lc = email.toLowerCase();
  if (pendingUsers.find(u => u.email.toLowerCase() === lc)) return res.json({ status:'pending' });
  if (rejectedEmails.includes(lc)) return res.json({ status:'rejected' });
  const user = users.find(u => u.email.toLowerCase() === lc);
  if (user) return res.json({ status:'approved', userId:user.id });
  return res.json({ status:'unknown' });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    return res.json({ ok:true, role:'admin', userId:0, email:ADMIN_EMAIL });
  }
  const lc = email.toLowerCase();
  if (rejectedEmails.includes(lc)) return res.status(401).json({ error:'Correo o contraseña incorrectos' });
  if (pendingUsers.find(u => u.email.toLowerCase() === lc)) return res.status(401).json({ error:'Correo o contraseña incorrectos' });

  const user = users.find(u => u.email.toLowerCase() === lc && u.password === password);
  if (!user) return res.status(401).json({ error:'Correo o contraseña incorrectos' });

  res.json({ ok:true, role:'user', userId:user.id, email:user.email, votedFor:user.votedFor });
});

// ── Admin: solicitudes pendientes ──────────────────────────────
app.get('/api/admin/pending', (req, res) => {
  if (!adminAuth(req, res)) return;
  res.json(pendingUsers);
});

// Aprobar
app.post('/api/admin/approve/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const id  = parseInt(req.params.id);
  const idx = pendingUsers.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error:'No encontrado' });

  const p = pendingUsers.splice(idx, 1)[0];
  const newUser = {
    id: nextUserId++,
    email:    p.email,
    password: p.password,
    igUrl:    p.igUrl || null,
    votedFor: [],
    registeredAt: new Date().toISOString()
  };
  users.push(newUser);

  // Agregar como candidato si trajo IG
  if (p.igUrl) {
    const parsed = parseIg(p.igUrl);
    if (parsed && !candidates.find(c => c.username.toLowerCase() === parsed.username.toLowerCase())) {
      candidates.push({ id:nextCandId++, igUrl:parsed.url, username:parsed.username, label:parsed.username, votes:0, addedBy:p.email });
    }
  }

  res.json({ ok:true });
});

// Rechazar
app.post('/api/admin/reject/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const id  = parseInt(req.params.id);
  const idx = pendingUsers.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error:'No encontrado' });

  const p = pendingUsers.splice(idx, 1)[0];
  rejectedEmails.push(p.email.toLowerCase());
  res.json({ ok:true });
});

// ── Admin: usuarios activos ────────────────────────────────────
app.get('/api/admin/users', (req, res) => {
  if (!adminAuth(req, res)) return;
  res.json(users);
});

// Eliminar usuario activo
app.delete('/api/admin/users/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const id  = parseInt(req.params.id);
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error:'No encontrado' });
  users.splice(idx, 1);
  res.json({ ok:true });
});

// ── Candidatos ─────────────────────────────────────────────────
app.get('/api/candidates', (req, res) => {
  res.json([...candidates].sort((a,b) => b.votes - a.votes));
});

app.post('/api/candidates', (req, res) => {
  const { igUrl, label, userId } = req.body;
  if (!igUrl) return res.status(400).json({ error:'igUrl requerido' });
  const parsed = parseIg(igUrl);
  if (!parsed) return res.status(400).json({ error:'URL de Instagram inválida' });
  if (candidates.find(c => c.username.toLowerCase() === parsed.username.toLowerCase())) {
    return res.status(409).json({ error:'Ese perfil ya está en la lista' });
  }
  const user = users.find(u => u.id === userId);
  candidates.push({ id:nextCandId++, igUrl:parsed.url, username:parsed.username, label:label||parsed.username, votes:0, addedBy:user?user.email:'desconocido' });
  res.status(201).json({ ok:true });
});

app.post('/api/candidates/:id/vote', (req, res) => {
  const candId = parseInt(req.params.id);
  const { userId } = req.body;
  const cand = candidates.find(c => c.id === candId);
  if (!cand) return res.status(404).json({ error:'No encontrado' });
  if (userId === 0) return res.status(403).json({ error:'El admin no puede votar' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error:'No autorizado' });
  if (user.votedFor.includes(candId)) return res.status(409).json({ error:'Ya votaste por este perfil' });
  cand.votes++;
  user.votedFor.push(candId);
  res.json({ votes:cand.votes });
});

app.delete('/api/candidates/:id', (req, res) => {
  const idx = candidates.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error:'No encontrado' });
  candidates.splice(idx, 1);
  res.json({ ok:true });
});

app.post('/api/reset', (req, res) => {
  candidates = candidates.map(c => ({ ...c, votes:0 }));
  users      = users.map(u => ({ ...u, votedFor:[] }));
  res.json({ ok:true });
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
