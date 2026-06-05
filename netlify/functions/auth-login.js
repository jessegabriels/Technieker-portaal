// netlify/functions/auth-login.js
const { sign, cors } = require('./lib/auth');
const { findByUsername, hashPassword } = require('./lib/users');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  if (event.httpMethod !== 'POST') {
    return cors({ error: 'Method not allowed' }, 405);
  }

  try {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
      return cors({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' }, 400);
    }

    const user = findByUsername(username.toLowerCase().trim());
    if (!user || !user.active) {
      return cors({ error: 'Ongeldige inloggegevens.' }, 401);
    }

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      return cors({ error: 'Ongeldige inloggegevens.' }, 401);
    }

    const token = sign({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
    });

    return cors({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return cors({ error: 'Interne fout. Probeer opnieuw.' }, 500);
  }
};
