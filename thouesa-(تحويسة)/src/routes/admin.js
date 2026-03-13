const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { generateWaybill } = require('../services/waybillService');

// Admin Check Middleware
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

router.use(auth, isAdmin);

router.get('/portal/stats', async (req, res) => {
    try {
        const [pending] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = "pending"');
        const [revenue] = await pool.query('SELECT SUM(final_price) as total FROM orders WHERE status = "completed"');
        const [trips] = await pool.query('SELECT COUNT(*) as count FROM trips WHERE trip_date > NOW()');
        const [users] = await pool.query('SELECT COUNT(*) as count FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)');

        res.json({
            pendingOrders: pending[0].count,
            totalRevenue: revenue[0].total || 0,
            upcomingTrips: trips[0].count,
            newUsers: users[0].count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/settings', async (req, res) => {
    try {
        const fields = Object.keys(req.body);
        const values = Object.values(req.body);
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        
        await pool.query(`UPDATE settings SET ${setClause} WHERE id = 1`, values);
        res.json({ message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, full_name, email, phone, role, verification_status, created_at FROM users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/users/:id/verification', async (req, res) => {
    const { status, note } = req.body;
    try {
        await pool.query(
            'UPDATE users SET verification_status = ?, verification_note = ? WHERE id = ?',
            [status, note, req.params.id]
        );
        
        // Notify User
        const notifId = uuidv4();
        const title = status === 'verified' ? 'تم توثيق حسابك' : 'تم رفض توثيق الحساب';
        const message = status === 'verified' 
            ? 'تهانينا! تم توثيق هويتك بنجاح. يمكنك الآن استخدام كافة ميزات المنصة.' 
            : `للأسف، تم رفض طلب توثيق هويتك. السبب: ${note || 'غير محدد'}`;
            
        await pool.query(
            'INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)',
            [notifId, req.params.id, title, message]
        );

        res.json({ message: 'User verification status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/orders', async (req, res) => {
    try {
        const { status, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
        let query = 'SELECT * FROM orders';
        let params = [];
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        query += ` ORDER BY ${sortBy} ${sortOrder}`;
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/orders/:id/status', async (req, res) => {
    const { status, reason, final_price, shipping_fees, customs_fees, insurance_amount, local_delivery_fees, tax_value } = req.body;
    try {
        const [order] = await pool.query('SELECT user_id, history, serial_number FROM orders WHERE id = ?', [req.params.id]);
        if (!order[0]) return res.status(404).json({ error: 'Order not found' });

        let history = [];
        try { history = JSON.parse(order[0].history || '[]'); } catch(e) {}
        history.push({ status, date: new Date(), reason });

        // Calculate final price if not provided explicitly, or just store what's given
        const calculated_final = parseFloat(shipping_fees || 0) + parseFloat(customs_fees || 0) + parseFloat(insurance_amount || 0) + parseFloat(local_delivery_fees || 0) + parseFloat(tax_value || 0);
        const price_to_set = final_price || calculated_final;

        await pool.query(
            `UPDATE orders SET 
                status = ?, 
                final_price = ?, 
                shipping_fees = ?,
                customs_fees = ?,
                insurance_amount = ?,
                local_delivery_fees = ?,
                tax_value = ?,
                history = ?, 
                rejection_reason = ? 
            WHERE id = ?`,
            [
                status, 
                price_to_set, 
                shipping_fees || 0,
                customs_fees || 0,
                insurance_amount || 0,
                local_delivery_fees || 0,
                tax_value || 0,
                JSON.stringify(history), 
                reason || null, 
                req.params.id
            ]
        );

        // Update Status History (Timeline)
        await pool.query(
            'INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, ?)',
            [uuidv4(), req.params.id, status]
        );

        // Generate Waybill if approved
        if (status === 'approved') {
            const [user] = await pool.query('SELECT * FROM users WHERE id = ?', [order[0].user_id]);
            const [fullOrder] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
            try {
                const waybillUrl = await generateWaybill(fullOrder[0], user[0]);
                await pool.query('UPDATE orders SET waybill_url = ? WHERE id = ?', [waybillUrl, req.params.id]);
            } catch (pdfErr) {
                console.error('PDF Generation failed:', pdfErr);
            }
        }

        // Send Notification
        const notifId = uuidv4();
        const title = status === 'approved' ? 'تم قبول طلبك' : status === 'rejected' ? 'تم رفض طلبك' : 'تحديث على حالة الطلب';
        const message = `الطلب رقم ${order[0].serial_number} أصبح حالته الآن: ${status}. ${reason ? 'السبب: ' + reason : ''}`;
        
        await pool.query(
            'INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)',
            [notifId, order[0].user_id, title, message]
        );

        // Referral Reward logic
        if (status === 'completed') {
            const [user] = await pool.query('SELECT referred_by FROM users WHERE id = ?', [order[0].user_id]);
            if (user[0] && user[0].referred_by) {
                const [referral] = await pool.query('SELECT id FROM referrals WHERE referred_id = ? AND status = "pending"', [order[0].user_id]);
                if (referral[0]) {
                    const [settings] = await pool.query('SELECT referral_reward_jod FROM settings WHERE id = 1');
                    const reward = settings[0].referral_reward_jod;
                    
                    await pool.query('UPDATE referrals SET status = "completed", reward_amount = ? WHERE id = ?', [reward, referral[0].id]);
                    await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [reward, user[0].referred_by]);
                    
                    // Notify Referrer
                    await pool.query(
                        'INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)',
                        [uuidv4(), user[0].referred_by, 'مكافأة دعوة صديق', `تم إضافة ${reward} د.أ إلى محفظتك لإتمام صديقك أول طلب.`]
                    );
                }
            }
        }

        res.json({ message: 'Order status updated and notification sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/trips', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM trips ORDER BY trip_date DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/trips', async (req, res) => {
    const { trip_date, route, description } = req.body;
    try {
        await pool.query(
            'INSERT INTO trips (id, trip_date, route, description) VALUES (?, ?, ?, ?)',
            [uuidv4(), trip_date, route, description]
        );
        res.json({ message: 'Trip added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/portal/trips/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM trips WHERE id = ?', [req.params.id]);
        res.json({ message: 'Trip deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Report Route
router.get('/portal/monthly-report', async (req, res) => {
    const { month, year } = req.query; // Format: MM and YYYY
    try {
        const startDate = `${year}-${month}-01 00:00:00`;
        const endDate = `${year}-${month}-31 23:59:59`;

        const [orders] = await pool.query(
            'SELECT COUNT(*) as total, SUM(final_price) as revenue, SUM(insurance_amount) as insurance FROM orders WHERE created_at BETWEEN ? AND ? AND status = "completed"',
            [startDate, endDate]
        );

        const [newUsers] = await pool.query(
            'SELECT COUNT(*) as count FROM users WHERE created_at BETWEEN ? AND ?',
            [startDate, endDate]
        );

        const [topUsers] = await pool.query(
            'SELECT u.full_name, COUNT(o.id) as order_count, SUM(o.final_price) as spent FROM orders o JOIN users u ON o.user_id = u.id WHERE o.created_at BETWEEN ? AND ? AND o.status = "completed" GROUP BY u.id ORDER BY spent DESC LIMIT 5',
            [startDate, endDate]
        );

        res.json({
            period: `${month}/${year}`,
            stats: orders[0],
            newUsers: newUsers[0].count,
            topUsers
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Support Tickets Management
router.get('/portal/tickets', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT t.*, u.full_name, u.phone FROM support_tickets t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/tickets/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE support_tickets SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Ticket status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/tickets/:id/replies', async (req, res) => {
    const { message } = req.body;
    try {
        await pool.query(
            'INSERT INTO support_ticket_replies (id, ticket_id, user_id, message) VALUES (?, ?, ?, ?)',
            [uuidv4(), req.params.id, req.user.id, message]
        );
        // Mark as answered
        await pool.query('UPDATE support_tickets SET status = "answered" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Reply sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wallet & Transactions Management
router.post('/portal/users/:id/wallet/adjust', async (req, res) => {
    const { amount, type, note } = req.body; // amount can be negative for withdrawal
    try {
        await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, req.params.id]);
        
        const transId = uuidv4();
        await pool.query(
            'INSERT INTO transactions (id, user_id, amount, type, status) VALUES (?, ?, ?, ?, "approved")',
            [transId, req.params.id, Math.abs(amount), amount >= 0 ? 'deposit' : 'withdrawal']
        );

        res.json({ message: 'Wallet adjusted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
