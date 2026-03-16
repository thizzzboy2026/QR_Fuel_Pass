const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { get, all, insert, run } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { getQuotaForType } = require('../utils/quota');

// List user's vehicles
router.get('/', authenticateToken, (req, res) => {
  const vehicles = all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(vehicles);
});

// Add a vehicle
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { vehicle_number, vehicle_type, fuel_type } = req.body;
    if (!vehicle_number || !vehicle_type || !fuel_type) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existing = get('SELECT id FROM vehicles WHERE vehicle_number = ?', [vehicle_number.toUpperCase()]);
    if (existing) return res.status(400).json({ error: 'Vehicle number already registered.' });

    const quota = getQuotaForType(vehicle_type);

    const vehicleId = insert(
      'INSERT INTO vehicles (user_id, vehicle_number, vehicle_type, fuel_type, weekly_quota, remaining_quota) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, vehicle_number.toUpperCase(), vehicle_type, fuel_type, quota, quota]
    );

    // Generate QR code
    const qrData = JSON.stringify({ vehicleId, vehicleNumber: vehicle_number.toUpperCase() });
    const qrCode = await QRCode.toDataURL(qrData, {
      width: 400, margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    run('UPDATE vehicles SET qr_code = ? WHERE id = ?', [qrCode, vehicleId]);

    const vehicle = get('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single vehicle
router.get('/:id', authenticateToken, (req, res) => {
  const vehicle = get(
    'SELECT v.*, u.full_name as owner_name FROM vehicles v JOIN users u ON v.user_id = u.id WHERE v.id = ?',
    [parseInt(req.params.id)]
  );
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });
  res.json(vehicle);
});

// Get QR code
router.get('/:id/qr', authenticateToken, (req, res) => {
  const vehicle = get('SELECT qr_code, vehicle_number FROM vehicles WHERE id = ?', [parseInt(req.params.id)]);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });
  res.json({ qr_code: vehicle.qr_code, vehicle_number: vehicle.vehicle_number });
});

// Delete vehicle
router.delete('/:id', authenticateToken, (req, res) => {
  run('DELETE FROM fuel_transactions WHERE vehicle_id = ?', [parseInt(req.params.id)]);
  run('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
  res.json({ success: true });
});

module.exports = router;
