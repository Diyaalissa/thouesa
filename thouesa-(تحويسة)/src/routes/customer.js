const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const upload = require('../middleware/upload');

router.use(auth);

router.post('/portal/upload/id', upload.single('id_card'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'يرجى اختيار ملف الصورة' });
        const filePath = `/uploads/id/${req.file.filename}`;
        await pool.query('UPDATE users SET id_image_url = ?, verification_status = "pending" WHERE id = ?', [filePath, req.user.id]);
        res.json({ message: 'تم رفع الهوية بنجاح، بانتظار التوثيق', filePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/upload/receipt', upload.single('receipt'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'يرجى اختيار ملف الوصل' });
        const filePath = `/uploads/receipts/${req.file.filename}`;
        res.json({ message: 'تم رفع الوصل بنجاح', filePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/upload/product', upload.single('product_image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة المنتج' });
        const filePath = `/uploads/products/${req.file.filename}`;
        res.json({ message: 'تم رفع صورة المنتج بنجاح', filePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/profile', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, customer_id, full_name, email, phone, address, national_id, verification_status, verification_note, referral_code, wallet_balance FROM users WHERE id = ?', [req.user.id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/profile', async (req, res) => {
    const { address } = req.body;
    try {
        // Only allow updating address. Name, phone, email, national_id are locked.
        await pool.query(
            'UPDATE users SET address = ? WHERE id = ?',
            [address, req.user.id]
        );
        res.json({ message: 'تم تحديث العنوان بنجاح. البيانات الأساسية محمية ولا يمكن تعديلها.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/orders', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/orders', async (req, res) => {
    const { 
        type, items, weight, total_amount, user_address, trip_id, 
        receipt_image_url, insurance_enabled, tax_value, item_category, 
        declared_value, delivery_method, product_image_url, address_id 
    } = req.body;
    try {
        const [settings] = await pool.query('SELECT insurance_rate FROM settings WHERE id = 1');
        const insurance_rate = settings[0].insurance_rate / 100;
        const insurance_amount = insurance_enabled ? (declared_value * insurance_rate) : 0;
        
        // Final total is calculated by admin later, but we store the initial estimate if needed
        const initial_total = parseFloat(total_amount || 0) + parseFloat(insurance_amount) + parseFloat(tax_value || 0);

        const id = uuidv4();
        const serial_number = `THO-26-${Math.floor(1000 + Math.random() * 9000)}`;
        const history = [{ status: 'pending', date: new Date() }];
        
        await pool.query(
            `INSERT INTO orders (
                id, serial_number, user_id, user_email, type, items, weight, 
                total_amount, final_price, user_address, trip_id, receipt_image_url, 
                history, insurance_enabled, insurance_amount, tax_value, item_category, 
                declared_value, delivery_method, product_image_url, address_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, serial_number, req.user.id, req.user.email, type, JSON.stringify(items), weight, 
                total_amount || 0, initial_total, user_address, trip_id, receipt_image_url, 
                JSON.stringify(history), insurance_enabled, insurance_amount, tax_value || 0, item_category, 
                declared_value || 0, delivery_method || 'pickup', product_image_url, address_id
            ]
        );

        // Initial Status History
        await pool.query(
            'INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, ?)',
            [uuidv4(), id, 'pending']
        );

        res.json({ message: 'Order created', order_id: id, serial_number, insurance_amount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/orders/:id', async (req, res) => {
    const { items, weight, user_address, trip_id, declared_value, insurance_enabled } = req.body;
    try {
        const [order] = await pool.query('SELECT status, history FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!order[0]) return res.status(404).json({ error: 'Order not found' });

        let history = [];
        try { history = JSON.parse(order[0].history || '[]'); } catch(e) {}
        history.push({ status: 'modified_pending', date: new Date(), note: 'Customer modified the order' });

        await pool.query(
            'UPDATE orders SET items = ?, weight = ?, user_address = ?, trip_id = ?, declared_value = ?, insurance_enabled = ?, status = "modified_pending", history = ? WHERE id = ?',
            [JSON.stringify(items), weight, user_address, trip_id, declared_value, insurance_enabled, JSON.stringify(history), req.params.id]
        );
        res.json({ message: 'Order updated and awaiting re-approval' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/addresses', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM addresses WHERE user_id = ?', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/addresses', async (req, res) => {
    const { name, phone, address, type } = req.body;
    try {
        await pool.query(
            'INSERT INTO addresses (id, user_id, name, phone, address, type) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), req.user.id, name, phone, address, type || 'Personal']
        );
        res.json({ message: 'Address added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/notifications', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/portal/notifications/:id/read', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/portal/addresses/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Address deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/reviews', async (req, res) => {
    const { order_id, rating, comment } = req.body;
    try {
        await pool.query(
            'INSERT INTO reviews (id, user_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), req.user.id, order_id, rating, comment]
        );
        res.json({ message: 'Review submitted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Support Tickets
router.get('/portal/tickets', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal/tickets', async (req, res) => {
    const { order_id, subject, message } = req.body;
    try {
        const id = uuidv4();
        await pool.query(
            'INSERT INTO support_tickets (id, user_id, order_id, subject, message) VALUES (?, ?, ?, ?, ?)',
            [id, req.user.id, order_id, subject, message]
        );
        res.json({ message: 'Ticket opened', ticket_id: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/tickets/:id/replies', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT r.*, u.full_name, u.role FROM support_ticket_replies r JOIN users u ON r.user_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC', [req.params.id]);
        res.json(rows);
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
        res.json({ message: 'Reply sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wallet & Transactions
router.get('/portal/wallet', async (req, res) => {
    try {
        let [rows] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
        if (rows.length === 0) {
            const id = uuidv4();
            await pool.query('INSERT INTO wallets (id, user_id, balance) VALUES (?, ?, 0)', [id, req.user.id]);
            [rows] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/portal/transactions', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Order Tracking History (Timeline)
router.get('/portal/orders/:id/history', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC', [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
