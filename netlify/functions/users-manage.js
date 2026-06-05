// netlify/functions/users-manage.js
const { requireAuth, cors } = require('./lib/auth');
const { getAll, create, update, remove, hashPassword } = require('./lib/users');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const user = requireAuth(event);
    if (user.role !== 'admin') return cors({ error: 'Geen toegang.' }, 403);

    // GET all users
    if (event.httpMethod === 'GET') {
      const users = getAll().map(u => ({ ...u, passwordHash: undefined }));
      return cors({ users });
    }

    // POST create user
    if (event.httpMethod === 'POST') {
      const { username, password, name, role, department } = JSON.parse(event.body || '{}');
      if (!username || !password || !name || !role || !department) {
        return cors({ error: 'Alle velden zijn verplicht.' }, 400);
      }
      const existing = getAll().find(u => u.username === username.toLowerCase());
      if (existing) return cors({ error: 'Gebruikersnaam bestaat al.' }, 409);

      const newUser = create({
        id: `user-${crypto.randomBytes(4).toString('hex')}`,
        username: username.toLowerCase().trim(),
        passwordHash: hashPassword(password),
        name,
        role,
        department,
        active: true,
      });
      return cors({ user: { ...newUser, passwordHash: undefined } });
    }

    // PUT update user
    if (event.httpMethod === 'PUT') {
      const { id, ...updates } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'ID verplicht.' }, 400);
      if (updates.password) {
        updates.passwordHash = hashPassword(updates.password);
        delete updates.password;
      }
      const updated = update(id, updates);
      if (!updated) return cors({ error: 'Gebruiker niet gevonden.' }, 404);
      return cors({ user: { ...updated, passwordHash: undefined } });
    }

    // DELETE user
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'ID verplicht.' }, 400);
      if (id === user.id) return cors({ error: 'Kan eigen account niet verwijderen.' }, 400);
      remove(id);
      return cors({ success: true });
    }

    return cors({ error: 'Method not allowed' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Users error:', err);
    return cors({ error: 'Interne fout.' }, 500);
  }
};
