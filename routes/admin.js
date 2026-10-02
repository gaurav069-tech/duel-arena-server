const express = require('express');
const { run, get, all } = require('../database');

const router = express.Router();
const ADMIN_PASSWORD = 'admin123';

function adminAuth(req, res, next) {
    const password = req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Admin login
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Admin logged in' });
    } else {
        res.status(401).json({ error: 'Wrong password' });
    }
});

// Dashboard stats
router.get('/stats', adminAuth, (req, res) => {
    try {
        const total = get('SELECT COUNT(*) as c FROM users').c;
        const active = get('SELECT COUNT(*) as c FROM users WHERE status = "active"').c;
        const banned = get('SELECT COUNT(*) as c FROM users WHERE status = "banned"').c;
        const suspended = get('SELECT COUNT(*) as c FROM users WHERE status = "suspended"').c;
        const rooms = get('SELECT COUNT(*) as c FROM rooms WHERE status = "waiting"').c;
        const games = get('SELECT COUNT(*) as c FROM game_history').c;

        res.json({
            totalUsers: total,
            activeUsers: active,
            bannedUsers: banned,
            suspendedUsers: suspended,
            activeRooms: rooms,
            totalGames: games
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all users
router.get('/users', adminAuth, (req, res) => {
    try {
        const users = all(
            `SELECT id, username, email, phone, status, wins, losses, created_at, last_login 
             FROM users ORDER BY id DESC`
        );
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get single user
router.get('/users/:id', adminAuth, (req, res) => {
    try {
        const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Change user status (ban/suspend/activate)
router.put('/users/:id/status', adminAuth, (req, res) => {
    const { status } = req.body;
    const valid = ['active', 'banned', 'suspended'];

    if (!valid.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        run('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: `User status changed to ${status}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete user
router.delete('/users/:id', adminAuth, (req, res) => {
    try {
        run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'User deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all rooms
router.get('/rooms', adminAuth, (req, res) => {
    try {
        const rooms = all(
            `SELECT r.*, 
                    u1.username as player1_name, 
                    u2.username as player2_name
             FROM rooms r
             LEFT JOIN users u1 ON u1.id = r.player1_id
             LEFT JOIN users u2 ON u2.id = r.player2_id
             ORDER BY r.created_at DESC LIMIT 50`
        );
        res.json(rooms);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete room
router.delete('/rooms/:id', adminAuth, (req, res) => {
    try {
        run('DELETE FROM rooms WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Room deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get game history
router.get('/history', adminAuth, (req, res) => {
    try {
        const history = all(
            `SELECT gh.*, 
                    u1.username as player1_name,
                    u2.username as player2_name,
                    uw.username as winner_name
             FROM game_history gh
             LEFT JOIN users u1 ON u1.id = gh.player1_id
             LEFT JOIN users u2 ON u2.id = gh.player2_id
             LEFT JOIN users uw ON uw.id = gh.winner_id
             ORDER BY gh.played_at DESC LIMIT 50`
        );
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
