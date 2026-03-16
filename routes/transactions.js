const express = require('express');
const router = express.Router();
const { get, all, insert, run } = require('../db/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Get user's fuel transactions
router.get('/', authenticateToken, (req, res) => {
  const transactions = all(`
    SELECT ft.*, v.vehicle_number, v.fuel_type
    FROM fuel_transactions ft
    JOIN vehicles v ON ft.vehicle_id = v.id
    WHERE ft.user_id = ?
    ORDER BY ft.created_at DESC
  `, [req.user.id]);
  res.json(transactions);
});

// Get operator's scan history
router.get('/scan-history', authenticateToken, requireRole('operator'), (req, res) => {
  const transactions = all(`
    SELECT ft.*, v.vehicle_number, v.fuel_type, u.full_name as owner_name
    FROM fuel_transactions ft
    JOIN vehicles v ON ft.vehicle_id = v.id
    JOIN users u ON ft.user_id = u.id
    WHERE ft.operator_id = ?
    ORDER BY ft.created_at DESC
  `, [req.user.id]);
  res.json(transactions);
});

// Get operator total scan count
router.get('/scan-count', authenticateToken, requireRole('operator'), (req, res) => {
  const result = get('SELECT COUNT(*) as count FROM fuel_transactions WHERE operator_id = ?', [req.user.id]);
  res.json({ count: result ? result.count : 0 });
});

// Lookup vehicle by ID (scanner)
router.get('/vehicle-lookup/:id', authenticateToken, requireRole('operator'), (req, res) => {
  const vehicle = get(`
    SELECT v.*, u.full_name as owner_name
    FROM vehicles v
    JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
  `, [parseInt(req.params.id)]);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

  const stations = all("SELECT id, name FROM fuel_stations WHERE status = 'active'");
  res.json({ vehicle, stations });
});

// Issue fuel
router.post('/issue', authenticateToken, requireRole('operator'), (req, res) => {
  try {
    const { vehicle_id, fuel_amount, station_id } = req.body;
    if (!vehicle_id || !fuel_amount) {
      return res.status(400).json({ error: 'Vehicle ID and fuel amount are required.' });
    }

    const vehicle = get(
      'SELECT v.*, u.full_name as owner_name FROM vehicles v JOIN users u ON v.user_id = u.id WHERE v.id = ?',
      [parseInt(vehicle_id)]
    );
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

    const amount = parseFloat(fuel_amount);
    if (amount <= 0) return res.status(400).json({ error: 'Fuel amount must be positive.' });

    if (amount > vehicle.remaining_quota) {
      return res.status(400).json({
        error: `Insufficient quota. Remaining: ${vehicle.remaining_quota}L, Requested: ${amount}L`,
        remaining_quota: vehicle.remaining_quota,
        requested: amount
      });
    }

    // Get station name
    let stationName = 'Unknown Station';
    if (station_id) {
      const station = get('SELECT name FROM fuel_stations WHERE id = ?', [parseInt(station_id)]);
      if (station) stationName = station.name;
    }

    // Deduct quota
    const newQuota = vehicle.remaining_quota - amount;
    run('UPDATE vehicles SET remaining_quota = ? WHERE id = ?', [newQuota, parseInt(vehicle_id)]);

    // Save transaction
    insert(
      'INSERT INTO fuel_transactions (vehicle_id, user_id, operator_id, fuel_amount, fuel_type, fuel_station, station_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [parseInt(vehicle_id), vehicle.user_id, req.user.id, amount, vehicle.fuel_type, stationName, station_id ? parseInt(station_id) : null]
    );

    res.json({
      success: true,
      remaining_quota: newQuota,
      message: `${amount}L of ${vehicle.fuel_type} issued to ${vehicle.vehicle_number}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
