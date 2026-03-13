const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/portal/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
        res.json(rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/trips', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM trips WHERE status = "open" ORDER BY trip_date ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/reviews', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT r.*, u.full_name 
            FROM reviews r 
            LEFT JOIN users u ON r.user_id = u.id 
            ORDER BY r.created_at DESC 
            LIMIT 6
        `);
        
        const processedRows = rows.map(row => ({
            ...row,
            full_name: row.full_name || 'عميل تحويسة'
        }));
        
        res.json(processedRows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
