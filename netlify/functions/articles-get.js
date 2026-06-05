// netlify/functions/articles-get.js
const { requireAuth, cors } = require('./lib/auth');
const { getForDepartment, getAll } = require('./lib/articles');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const user = requireAuth(event);
    let articles;

    if (user.role === 'admin' || user.department === 'all') {
      articles = getAll();
    } else {
      articles = getForDepartment(user.department);
    }

    return cors({ articles });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Articles error:', err);
    return cors({ error: 'Fout bij ophalen artikelen.' }, 500);
  }
};
