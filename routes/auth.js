const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../database');

const router = express.Router();
const SECRET = 'duelarena_secret_key_2025';

// Register
router.post('/register', async (req, res) => {
    const { username, password, email, phone } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const existing = get('SELECT * FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hash = await bcrypt.hash(password, 10);

        run('INSERT INTO users (username, password, email, phone) VALUES (?, ?, ?, ?)',
            [username, hash, email || null, phone || null]);

        const user = get('SELECT * FROM users WHERE username = ?', [username]);
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                status: user.status,
                wins: user.wins,
                losses: user.losses
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const user = get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user) return res.status(401).json({ error: 'User not found' });
        if (user.status === 'banned') return res.status(403).json({ error: 'Account banned' });
        if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid password' });

        run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                status: user.status,
                wins: user.wins,
                losses: user.losses
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verify token
router.get('/verify', (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, SECRET);
        res.json({ success: true, user: decoded });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
