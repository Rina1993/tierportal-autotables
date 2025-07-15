const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const pg = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Tabellen automatisch erstellen, falls nicht vorhanden
async function ensureTables() {
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    );
  \`);
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      title TEXT,
      description TEXT,
      images TEXT,
      owner_id INTEGER REFERENCES users(id)
    );
  \`);
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER REFERENCES users(id),
      listing_id INTEGER REFERENCES listings(id)
    );
  \`);
  console.log("Tabellen überprüft/erstellt.");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Nur .jpg, .jpeg, .png erlaubt!'));
  }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hash, role]);
    res.redirect('/login');
  } catch (err) {
    res.send('Fehler bei Registrierung: Benutzername möglicherweise vergeben.');
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user) return res.send('Benutzer nicht gefunden.');
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send('Falsches Passwort.');
  req.session.userId = user.id;
  req.session.role = user.role;
  res.redirect('/dashboard');
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId])).rows[0];
  if (user.role === 'vermieter') {
    const listings = (await pool.query('SELECT * FROM listings WHERE owner_id = $1', [user.id])).rows;
    res.render('dashboard', { user, listings });
  } else {
    const listings = (await pool.query('SELECT * FROM listings')).rows;
    const favs = (await pool.query('SELECT listing_id FROM favorites WHERE user_id = $1', [user.id])).rows.map(f => f.listing_id);
    res.render('listings', { user, listings, favs });
  }
});

app.post('/add-listing', upload.array('images', 5), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { title, description } = req.body;
  const images = req.files.map(f => f.filename);
  await pool.query('INSERT INTO listings (title, description, images, owner_id) VALUES ($1, $2, $3, $4)', [title, description, JSON.stringify(images), req.session.userId]);
  res.redirect('/dashboard');
});

app.post('/toggle-favorite/:id', async (req, res) => {
  const listingId = parseInt(req.params.id);
  const userId = req.session.userId;
  const exists = await pool.query('SELECT * FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
  if (exists.rows.length > 0) {
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
  } else {
    await pool.query('INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2)', [userId, listingId]);
  }
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

ensureTables().then(() => {
  app.listen(PORT, () => console.log('Portal läuft auf Port', PORT));
});
