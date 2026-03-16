const express = require('express');
const router = express.Router();
const { get, all, insert, run } = require('../db/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Dashboard stats
router.get('/dashboard', authenticateToken, requireRole('admin'), (req, res) => {
  const u = get("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
  const v = get('SELECT COUNT(*) as count FROM vehicles');
  const t = get('SELECT COUNT(*) as count FROM fuel_transactions');
  const f = get('SELECT COALESCE(SUM(fuel_amount), 0) as total FROM fuel_transactions');
  res.json({
    totalUsers: u ? u.count : 0,
    totalVehicles: v ? v.count : 0,
    totalTransactions: t ? t.count : 0,
    totalFuelIssued: f ? f.total : 0
  });
});

// ---- User Management ----
router.get('/users', authenticateToken, requireRole('admin'), (req, res) => {
  const users = all('SELECT id, full_name, email, role, status, created_at FROM users ORDER BY created_at DESC');
  res.json(users);
});

router.delete('/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const target = get('SELECT role FROM users WHERE id = ?', [parseInt(req.params.id)]);
  if (target && target.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin accounts.' });
  const vehicles = all('SELECT id FROM vehicles WHERE user_id = ?', [parseInt(req.params.id)]);
  for (const v of vehicles) {
    run('DELETE FROM fuel_transactions WHERE vehicle_id = ?', [v.id]);
  }
  run('DELETE FROM vehicles WHERE user_id = ?', [parseInt(req.params.id)]);
  run('DELETE FROM users WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

router.patch('/users/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or disabled.' });
  }
  run('UPDATE users SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
  res.json({ success: true });
});

// ---- Vehicle Management ----
router.get('/vehicles', authenticateToken, requireRole('admin'), (req, res) => {
  const vehicles = all(`
    SELECT v.*, u.full_name as owner_name
    FROM vehicles v
    JOIN users u ON v.user_id = u.id
    ORDER BY v.created_at DESC
  `);
  res.json(vehicles);
});

router.patch('/vehicles/:id/quota', authenticateToken, requireRole('admin'), (req, res) => {
  const { weekly_quota } = req.body;
  if (!weekly_quota || weekly_quota <= 0) {
    return res.status(400).json({ error: 'Weekly quota must be a positive number.' });
  }
  run('UPDATE vehicles SET weekly_quota = ?, remaining_quota = ? WHERE id = ?',
    [parseFloat(weekly_quota), parseFloat(weekly_quota), parseInt(req.params.id)]);
  res.json({ success: true });
});

router.delete('/vehicles/:id', authenticateToken, requireRole('admin'), (req, res) => {
  run('DELETE FROM fuel_transactions WHERE vehicle_id = ?', [parseInt(req.params.id)]);
  run('DELETE FROM vehicles WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// ---- Transaction Management ----
router.get('/transactions', authenticateToken, requireRole('admin'), (req, res) => {
  const transactions = all(`
    SELECT ft.*, v.vehicle_number, v.fuel_type, u.full_name as owner_name,
           op.full_name as operator_name
    FROM fuel_transactions ft
    JOIN vehicles v ON ft.vehicle_id = v.id
    JOIN users u ON ft.user_id = u.id
    LEFT JOIN users op ON ft.operator_id = op.id
    ORDER BY ft.created_at DESC
  `);
  res.json(transactions);
});

router.delete('/transactions/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const tx = get('SELECT * FROM fuel_transactions WHERE id = ?', [parseInt(req.params.id)]);
  if (tx) {
    run('UPDATE vehicles SET remaining_quota = remaining_quota + ? WHERE id = ?', [tx.fuel_amount, tx.vehicle_id]);
    run('DELETE FROM fuel_transactions WHERE id = ?', [parseInt(req.params.id)]);
  }
  res.json({ success: true });
});

// ---- Station Management ----
router.get('/stations', authenticateToken, requireRole('admin'), (req, res) => {
  const stations = all('SELECT * FROM fuel_stations ORDER BY created_at DESC');
  const result = stations.map(s => {
    const txCount = get('SELECT COUNT(*) as count FROM fuel_transactions WHERE station_id = ?', [s.id]);
    const totalFuel = get('SELECT COALESCE(SUM(fuel_amount), 0) as total FROM fuel_transactions WHERE station_id = ?', [s.id]);
    return {
      ...s,
      transaction_count: txCount ? txCount.count : 0,
      total_fuel: totalFuel ? totalFuel.total : 0
    };
  });
  res.json(result);
});

router.post('/stations', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required.' });
  const id = insert('INSERT INTO fuel_stations (name, location) VALUES (?, ?)', [name, location || '']);
  const station = get('SELECT * FROM fuel_stations WHERE id = ?', [id]);
  res.json(station);
});

router.delete('/stations/:id', authenticateToken, requireRole('admin'), (req, res) => {
  run('UPDATE fuel_transactions SET station_id = NULL WHERE station_id = ?', [parseInt(req.params.id)]);
  run('DELETE FROM fuel_stations WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

module.exports = router;
