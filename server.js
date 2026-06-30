const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Almacenamiento en memoria (se reinicia si el servidor se reinicia)
// Para persistencia permanente, conecta una base de datos en Railway
let profiles = [];
let nextId = 1;

// GET - obtener todos los perfiles ordenados por votos
app.get('/api/profiles', (req, res) => {
  const sorted = [...profiles].sort((a, b) => b.votes - a.votes);
  res.json(sorted);
});

// POST - agregar perfil
app.post('/api/profiles', (req, res) => {
  const { url, username, label } = req.body;

  if (!url || !username) {
    return res.status(400).json({ error: 'url y username son requeridos' });
  }

  const exists = profiles.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Ese perfil ya existe' });
  }

  const profile = {
    id: nextId++,
    url,
    username,
    label: label || username,
    votes: 0,
    addedAt: new Date().toISOString()
  };

  profiles.push(profile);
  res.status(201).json(profile);
});

// POST - votar por un perfil
app.post('/api/profiles/:id/vote', (req, res) => {
  const id = parseInt(req.params.id);
  const profile = profiles.find(p => p.id === id);

  if (!profile) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  profile.votes++;
  res.json({ votes: profile.votes });
});

// DELETE - eliminar perfil
app.delete('/api/profiles/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = profiles.findIndex(p => p.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  profiles.splice(idx, 1);
  res.json({ ok: true });
});

// POST - reiniciar votos
app.post('/api/reset', (req, res) => {
  profiles = profiles.map(p => ({ ...p, votes: 0 }));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
