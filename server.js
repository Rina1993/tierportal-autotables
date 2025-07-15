const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM listings ORDER BY id DESC LIMIT 10');
  res.render('index', { listings: result.rows });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
