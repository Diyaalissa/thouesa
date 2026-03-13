const pool = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function initDB() {
    try {
        // Helper to add column if not exists (compatible with older MySQL/MariaDB)
        const addColumn = async (table, column, definition) => {
            const [cols] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
            if (cols.length === 0) {
                await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`Added column ${column} to ${table}`);
            }
        };

        // Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Ensure all columns exist (Migration style)
        await addColumn('users', 'customer_id', 'VARCHAR(20) UNIQUE');
        await addColumn('users', 'email', 'VARCHAR(255) UNIQUE');
        await addColumn('users', 'role', "ENUM('admin', 'customer') DEFAULT 'customer'");
        await addColumn('users', 'address', 'TEXT');
        await addColumn('users', 'national_id', 'VARCHAR(100)');
        await addColumn('users', 'id_image_url', 'TEXT');
        await addColumn('users', 'verification_status', "ENUM('pending', 'verified', 'rejected') DEFAULT 'pending'");
        await addColumn('users', 'verification_note', 'TEXT');
        await addColumn('users', 'referral_code', 'VARCHAR(20) UNIQUE');
        await addColumn('users', 'referred_by', 'VARCHAR(36)');
        await addColumn('users', 'wallet_balance', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('users', 'failed_attempts', 'INT DEFAULT 0');
        await addColumn('users', 'locked_until', 'TIMESTAMP NULL');

        // Settings Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY DEFAULT 1,
                hero_title VARCHAR(255),
                hero_slogan TEXT,
                hero_bg TEXT,
                main_screen_title VARCHAR(255),
                main_screen_description TEXT,
                show_news BOOLEAN DEFAULT FALSE,
                news_text TEXT,
                news_image TEXT,
                news_link TEXT,
                show_next_trip BOOLEAN DEFAULT FALSE,
                price_per_kg DECIMAL(10,2) DEFAULT 5.0,
                jod_rate DECIMAL(10,4) DEFAULT 1.0,
                dzd_rate DECIMAL(10,4) DEFAULT 1.0,
                next_trip_title VARCHAR(255),
                next_trip_subtitle TEXT,
                next_shipping_date VARCHAR(100),
                step_1_text TEXT,
                step_2_text TEXT,
                step_3_text TEXT,
                step_4_text TEXT,
                rev_1_text TEXT,
                rev_1_name VARCHAR(255),
                rev_2_text TEXT,
                rev_2_name VARCHAR(255),
                map_jo TEXT,
                map_dz TEXT,
                address_jo TEXT,
                address_dz TEXT,
                contact_wa VARCHAR(50),
                fb_link TEXT,
                contact_phone VARCHAR(50),
                footer_text TEXT,
                privacy_policy TEXT,
                terms_conditions TEXT,
                about_us TEXT,
                insurance_rate DECIMAL(5,2) DEFAULT 2.0,
                referral_reward_jod DECIMAL(10,2) DEFAULT 1.0,
                refund_policy_text TEXT,
                faqs LONGTEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await addColumn('settings', 'faqs', 'LONGTEXT');
        await addColumn('settings', 'hero_bg', 'TEXT');
        await addColumn('settings', 'hero_bg_mobile', 'TEXT');

        // Insert default settings if not exists
        const [rows] = await pool.query('SELECT id FROM settings WHERE id = 1');
        if (rows.length === 0) {
            await pool.query(`
                INSERT INTO settings (id, hero_title, hero_slogan, main_screen_title, main_screen_description, jod_rate, dzd_rate, faqs) 
                VALUES (1, 'تحويسة | بوابتك اللوجستية بين الأردن والجزائر', 'نحن لا ننقل الطرود فقط، نحن ننقل الثقة. حلول شحن ذكية، آمنة، ومتكاملة لخدمات الشحن الشخصي والوساطة التجارية.', 'عن تحويسة', 'نحن نقدم حلولاً لوجستية مبتكرة تربط بين الأردن والجزائر، مع التركيز على الأمان والسرعة والشفافية في كل شحنة.', 1.0, 250.0, '[{"q": "ما هي خدمة اشترِ لي؟", "a": "هي خدمة وساطة تجارية حيث نقوم بشراء المنتجات التي ترغب بها من المتاجر الأردنية أو العالمية وشحنها إليك مباشرة في الجزائر."}, {"q": "هل الشحن آمن ومضمون؟", "a": "نعم، نحن نوفر نظام تأمين اختياري يغطي قيمة الشحنة بالكامل في حال الفقدان أو التلف، مع تتبع دقيق لكل خطوة."}, {"q": "كيف يتم احتساب تكلفة الشحن؟", "a": "تعتمد التكلفة على وزن الشحنة الفعلي ونوع الخدمة المختارة. يمكنك معرفة السعر النهائي بعد مراجعة طلبك من قبل فريقنا."}, {"q": "ما هي المناطق التي تغطيها تحويسة في الجزائر؟", "a": "نحن نغطي حالياً كافة الولايات الجزائرية الـ 58 من خلال شبكة شركاء لوجستيين محليين."}]')
            `);
        }

        // Trips Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS trips (
                id VARCHAR(36) PRIMARY KEY,
                trip_date DATETIME NOT NULL,
                route VARCHAR(255) NOT NULL,
                description TEXT,
                status ENUM('open', 'closed') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Orders Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id VARCHAR(36) PRIMARY KEY,
                serial_number VARCHAR(50) UNIQUE,
                user_id VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await addColumn('orders', 'user_email', 'VARCHAR(255)');
        await addColumn('orders', 'user_address', 'TEXT');
        await addColumn('orders', 'type', 'VARCHAR(50)');
        await addColumn('orders', 'items', 'LONGTEXT');
        await addColumn('orders', 'weight', 'DECIMAL(10,2)');
        await addColumn('orders', 'total_amount', 'DECIMAL(10,2)');
        await addColumn('orders', 'final_price', 'DECIMAL(10,2)');
        await addColumn('orders', 'status', "ENUM('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled', 'modified_pending') DEFAULT 'pending'");
        await addColumn('orders', 'history', 'LONGTEXT');
        await addColumn('orders', 'trip_id', 'VARCHAR(36)');
        await addColumn('orders', 'receipt_image_url', 'TEXT');
        await addColumn('orders', 'declared_value', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'rejection_reason', 'TEXT');
        await addColumn('orders', 'insurance_enabled', 'BOOLEAN DEFAULT FALSE');
        await addColumn('orders', 'insurance_amount', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'tax_value', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'customs_fees', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'local_delivery_fees', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'shipping_fees', 'DECIMAL(10,2) DEFAULT 0.0');
        await addColumn('orders', 'delivery_method', "ENUM('pickup', 'door_to_door') DEFAULT 'pickup'");
        await addColumn('orders', 'product_image_url', 'TEXT');
        await addColumn('orders', 'address_id', 'VARCHAR(36)');
        await addColumn('orders', 'item_category', 'VARCHAR(100)');
        await addColumn('orders', 'waybill_url', 'TEXT');
        await addColumn('orders', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

        // Order Status History Table (for Timeline)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_status_history (
                id VARCHAR(36) PRIMARY KEY,
                order_id VARCHAR(36),
                status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Wallets Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wallets (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) UNIQUE,
                balance DECIMAL(10,2) DEFAULT 0.0,
                currency VARCHAR(10) DEFAULT 'JOD',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Support Tickets Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                order_id VARCHAR(36),
                subject VARCHAR(255),
                message TEXT,
                status ENUM('open', 'answered', 'closed') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Support Ticket Replies Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_ticket_replies (
                id VARCHAR(36) PRIMARY KEY,
                ticket_id VARCHAR(36),
                user_id VARCHAR(36),
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES support_tickets(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Transactions Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                amount DECIMAL(10,2),
                type ENUM('deposit', 'withdrawal', 'payment') DEFAULT 'deposit',
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                receipt_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Reviews Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                order_id VARCHAR(36),
                rating INT,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await addColumn('reviews', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await addColumn('reviews', 'order_id', 'VARCHAR(36)');
        await addColumn('reviews', 'rating', 'INT');
        await addColumn('reviews', 'comment', 'TEXT');

        // Addresses Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS addresses (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await addColumn('addresses', 'name', 'VARCHAR(255)');
        await addColumn('addresses', 'phone', 'VARCHAR(50)');
        await addColumn('addresses', 'address', 'TEXT');
        await addColumn('addresses', 'type', 'VARCHAR(50) DEFAULT "Personal"');

        // Notifications Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                title VARCHAR(255),
                message TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Referrals Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id VARCHAR(36) PRIMARY KEY,
                referrer_id VARCHAR(36),
                referred_id VARCHAR(36),
                status ENUM('pending', 'completed') DEFAULT 'pending',
                reward_amount DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(id),
                FOREIGN KEY (referred_id) REFERENCES users(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Ensure Upload Directories Exist
        const fs = require('fs');
        const dirs = ['uploads', 'uploads/id', 'uploads/receipts', 'uploads/waybills', 'uploads/products'];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Directory created: ${dir}`);
            }
        });

        // Insert or Update default admin
        const adminPhone = '+962798050215';
        const [adminRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [adminPhone]);
        const hashedAdminPass = await bcrypt.hash('admin_thouesa_2026', 10);
        
        if (adminRows.length === 0) {
            const adminId = uuidv4();
            await pool.query(
                'INSERT INTO users (id, customer_id, full_name, phone, password, role, verification_status, referral_code, failed_attempts, locked_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)',
                [adminId, 'CID-ADMIN', 'Admin Thouesa', adminPhone, hashedAdminPass, 'admin', 'verified', 'TH-ADMIN']
            );
            console.log('Default admin user created');
        } else {
            // Reset admin password and lockout on every start for safety during development/fix
            await pool.query(
                'UPDATE users SET password = ?, failed_attempts = 0, locked_until = NULL WHERE phone = ? AND role = "admin"',
                [hashedAdminPass, adminPhone]
            );
            console.log('Admin user status reset');
        }

        console.log('Database initialized successfully');

        // Seed Reviews if none exist
        console.log('Checking for seed reviews...');
        const seedData = [
            { name: 'أحمد بن يوسف', phone: '+213111111111', rating: 5, comment: 'خدمة ممتازة وسريعة جداً. وصلت الشحنة من عمان إلى الجزائر العاصمة في أقل من 10 أيام وبحالة ممتازة.' },
            { name: 'سارة محمود', phone: '+213222222222', rating: 5, comment: 'جربت خدمة "اشترِ لي" وكانت تجربة رائعة. وفروا علي عناء البحث والدفع الدولي. شكراً لفريق تحويسة.' },
            { name: 'محمد علي', phone: '+213333333333', rating: 4, comment: 'تعامل راقي جداً وتتبع دقيق للشحنة. أنصح بالتعامل معهم لمن يبحث عن الأمان والمصداقية.' }
        ];

        for (const data of seedData) {
            // 1. Ensure User exists
            let [userRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [data.phone]);
            let userId;
            if (userRows.length === 0) {
                userId = uuidv4();
                const hashedSeedPass = await bcrypt.hash('seed_pass_123', 10);
                await pool.query(
                    'INSERT INTO users (id, full_name, phone, password, role, verification_status) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, data.name, data.phone, hashedSeedPass, 'customer', 'verified']
                );
            } else {
                userId = userRows[0].id;
                // Force update password for seed users to ensure it's hashed
                const hashedSeedPass = await bcrypt.hash('seed_pass_123', 10);
                await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedSeedPass, userId]);
            }

            // 2. Check if this user already has a review
            let [revRows] = await pool.query('SELECT id FROM reviews WHERE user_id = ?', [userId]);
            if (revRows.length === 0) {
                await pool.query(
                    'INSERT INTO reviews (id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
                    [uuidv4(), userId, data.rating, data.comment]
                );
                console.log(`Added seed review for ${data.name}`);
            }
        }
        console.log('Seed reviews check completed');
    } catch (err) {
        console.error('Database initialization failed:', err);
    }
}

module.exports = initDB;
