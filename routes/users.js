const express = require('express');
const jwt = require('jsonwebtoken');
const { run, get, all } = require('../database');

const router = express.Router();
const SECRET = 'duelarena_secret_key_2025';

function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Get my profile
router.get('/me', auth, (req, res) => {
    const user = get(
        'SELECT id, username, email, phone, status, wins, losses, created_at, last_login FROM users WHERE id = ?',
        [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// Update profile
router.put('/me', auth, (req, res) => {
    const { email, phone } = req.body;
    run('UPDATE users SET email = ?, phone = ? WHERE id = ?',
        [email || null, phone || null, req.user.id]);
    res.json({ success: true, message: 'Profile updated' });
});

// Get stats
router.get('/stats', auth, (req, res) => {
    const user = get('SELECT wins, losses FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const total = user.wins + user.losses;
    const winRate = total > 0 ? ((user.wins / total) * 100).toFixed(1) : 0;

    res.json({
        wins: user.wins,
        losses: user.losses,
        total: total,
        winRate: winRate
    });
});

// Leaderboard
router.get('/leaderboard', (req, res) => {
    const users = all(
        'SELECT username, wins, losses FROM users WHERE status = "active" ORDER BY wins DESC LIMIT 10'
    );
    res.json(users);
});

// Game history
router.get('/history', auth, (req, res) => {
    const history = all(
        `SELECT room_code, winner_id, player1_score, player2_score, played_at 
         FROM game_history 
         WHERE player1_id = ? OR player2_id = ? 
         ORDER BY played_at DESC LIMIT 20`,
        [req.user.id, req.user.id]
    );
    res.json(history);
});

module.exports = router;
