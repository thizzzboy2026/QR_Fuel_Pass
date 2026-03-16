const express = require('express');
const router = express.Router();
const { get } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  const user = get(
    'SELECT id, full_name, email, role, status, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

// Get user dashboard stats
router.get('/dashboard', authenticateToken, (req, res) => {
  const tv = get('SELECT COUNT(*) as count FROM vehicles WHERE user_id = ?', [req.user.id]);
  const wq = get('SELECT COALESCE(SUM(weekly_quota), 0) as total FROM vehicles WHERE user_id = ?', [req.user.id]);
  const rq = get('SELECT COALESCE(SUM(remaining_quota), 0) as total FROM vehicles WHERE user_id = ?', [req.user.id]);
  const tf = get('SELECT COUNT(*) as count FROM fuel_transactions WHERE user_id = ?', [req.user.id]);

  res.json({
    totalVehicles: tv ? tv.count : 0,
    weeklyQuota: wq ? wq.total : 0,
    remainingQuota: rq ? rq.total : 0,
    totalFillings: tf ? tf.count : 0
  });
});

module.exports = router;
