const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, insert } = require('../db/connection');
const { SECRET } = require('../middleware/auth');

// User signup
router.post('/signup', (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    const hash = bcrypt.hashSync(password, 10);
    const id = insert(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [full_name, email, hash, 'user']
    );

    const token = jwt.sign({ id, email, role: 'user', full_name }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, full_name, email, role: 'user' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = get("SELECT * FROM users WHERE email = ? AND role = 'user'", [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.status === 'disabled') return res.status(403).json({ error: 'Account has been disabled.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Operator login
router.post('/operator/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = get("SELECT * FROM users WHERE email = ? AND role = 'operator'", [email]);
    if (!user) return res.status(401).json({ error: 'Invalid operator credentials.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid operator credentials.' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login
router.post('/admin/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = get("SELECT * FROM users WHERE email = ? AND role = 'admin'", [email]);
    if (!user) return res.status(401).json({ error: 'Invalid admin credentials.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
