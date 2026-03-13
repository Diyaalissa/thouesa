const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

router.post('/register', async (req, res) => {
    const { full_name, phone, password } = req.body;
    console.log(`Registration attempt for: ${phone}`);
    const email = req.body.email && req.body.email.trim() !== '' ? req.body.email.trim() : null;
    
    // 1. Password Strength Validation
    if (!password || password.length < 8) {
        console.log('Registration failed: Password too short');
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
        console.log('Registration failed: Password weak');
        return res.status(400).json({ error: 'كلمة المرور يجب أن تحتوي على حروف وأرقام لزيادة الأمان' });
    }

    try {
        // 2. Check if user already exists
        const [existing] = await pool.query('SELECT id FROM users WHERE phone = ? OR (email = ? AND email IS NOT NULL)', [phone, email]);
        if (existing.length > 0) {
            console.log(`Registration failed: User already exists (${phone})`);
            return res.status(400).json({ error: 'رقم الهاتف أو البريد الإلكتروني مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const id = uuidv4();
        const customer_id = 'CID-' + Math.floor(1000 + Math.random() * 9000);
        const referral_code = 'TH-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        await pool.query(
            'INSERT INTO users (id, customer_id, full_name, phone, email, password, referral_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, customer_id, full_name, phone, email || null, hashedPassword, referral_code]
        );
        console.log(`Registration successful for: ${phone}`);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { phone, email, password } = req.body;
    const identifier = email || phone;
    console.log(`Login attempt for: ${identifier}`);
    try {
        let user;
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR phone = ?', [identifier, identifier]);
        user = rows[0];

        if (!user) {
            console.log(`Login failed: User not found (${identifier})`);
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        // 3. Account Lockout Check
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            console.log(`Login failed: Account locked (${identifier})`);
            const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(403).json({ error: `الحساب مقفل مؤقتاً بسبب محاولات خاطئة متكررة. يرجى المحاولة بعد ${minutesLeft} دقيقة` });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log(`Login failed: Password mismatch (${identifier})`);
            // 4. Increment failed attempts
            const newAttempts = (user.failed_attempts || 0) + 1;
            let lockTime = null;
            if (newAttempts >= 5) {
                lockTime = new Date(Date.now() + 15 * 60000); // Lock for 15 minutes
            }
            await pool.query('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [newAttempts, lockTime, user.id]);
            
            const remaining = 5 - newAttempts;
            const msg = remaining > 0 ? `بيانات الدخول غير صحيحة. تبقى لك ${remaining} محاولات قبل قفل الحساب` : 'تم قفل الحساب لمدة 15 دقيقة';
            return res.status(401).json({ error: msg });
        }

        // 5. Reset failed attempts on success
        await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'thouesa_secure_fallback_secret_2026',
            { expiresIn: '24h' }
        );

        console.log(`Login successful for: ${identifier} (Role: ${user.role})`);
        res.json({ token, user: { id: user.id, full_name: user.full_name, role: user.role, email: user.email, phone: user.phone } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
