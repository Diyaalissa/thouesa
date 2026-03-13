const pool = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function runTests() {
    console.log('--- Starting Comprehensive Test Suite ---');
    const results = [];
    const testId = 'TEST-' + Math.floor(Math.random() * 10000);
    const testPhone = '+962000000000';
    const testEmail = `test_${testId}@example.com`;
    const testPass = 'TestPass123';
    
    const adminPhone = '+962798050215';
    const adminPass = 'admin_thouesa_2026';

    try {
        // 1. Manager/Admin Login Test
        console.log('1. Testing Admin Login...');
        const [adminRows] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = "admin"', [adminPhone]);
        if (adminRows.length === 0) throw new Error('Admin user not found in DB');
        
        const adminUser = adminRows[0];
        const isAdminPassMatch = await bcrypt.compare(adminPass, adminUser.password);
        if (!isAdminPassMatch) throw new Error('Admin password mismatch');
        
        results.push({ step: 'Admin Login', status: 'Passed' });

        // 2. Customer Account Creation Test
        console.log('2. Testing Customer Registration...');
        const hashedPassword = await bcrypt.hash(testPass, 12);
        const userId = uuidv4();
        const customerId = 'CID-TEST-' + testId;
        const referralCode = 'TH-TEST-' + testId;

        await pool.query(
            'INSERT INTO users (id, customer_id, full_name, phone, email, password, referral_code, role) VALUES (?, ?, ?, ?, ?, ?, ?, "customer")',
            [userId, customerId, 'Test User', testPhone, testEmail, hashedPassword, referralCode]
        );
        results.push({ step: 'Customer Registration', status: 'Passed' });

        // 3. Customer Login Test
        console.log('3. Testing Customer Login...');
        const [userRows] = await pool.query('SELECT * FROM users WHERE phone = ?', [testPhone]);
        const user = userRows[0];
        const isUserPassMatch = await bcrypt.compare(testPass, user.password);
        if (!isUserPassMatch) throw new Error('Customer password mismatch');
        results.push({ step: 'Customer Login', status: 'Passed' });

        // 4. Order Placement Test
        console.log('4. Testing Order Placement...');
        const orderId = uuidv4();
        const serialNum = 'SN-TEST-' + testId;
        const items = [{ name: 'Test Item', qty: 1 }];
        const history = [{ status: 'pending', date: new Date() }];

        await pool.query(
            'INSERT INTO orders (id, serial_number, user_id, user_email, type, items, weight, total_amount, final_price, status, history) VALUES (?, ?, ?, ?, "Shipping", ?, 1.5, 10.0, 10.0, "pending", ?)',
            [orderId, serialNum, userId, testEmail, JSON.stringify(items), JSON.stringify(history)]
        );
        results.push({ step: 'Order Placement', status: 'Passed' });

        // 5. Admin Order Verification Test
        console.log('5. Testing Admin Order Verification...');
        const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orderRows.length === 0) throw new Error('Order not found after placement');
        
        // Approve order
        const newHistory = [...history, { status: 'approved', date: new Date(), reason: 'Test Approval' }];
        await pool.query(
            'UPDATE orders SET status = "approved", history = ? WHERE id = ?',
            [JSON.stringify(newHistory), orderId]
        );
        
        const [updatedOrder] = await pool.query('SELECT status FROM orders WHERE id = ?', [orderId]);
        if (updatedOrder[0].status !== 'approved') throw new Error('Order status not updated to approved');
        results.push({ step: 'Admin Order Verification', status: 'Passed' });

        // 6. Cleanup
        console.log('6. Cleaning up test data...');
        await pool.query('DELETE FROM orders WHERE id = ?', [orderId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        results.push({ step: 'Cleanup', status: 'Passed' });

        console.log('--- All Tests Passed Successfully ---');
        return { success: true, results };
    } catch (err) {
        console.error('Test Suite Failed:', err);
        // Attempt cleanup even on failure
        try {
            await pool.query('DELETE FROM orders WHERE serial_number LIKE "SN-TEST-%"');
            await pool.query('DELETE FROM users WHERE customer_id LIKE "CID-TEST-%"');
        } catch (e) {}
        
        return { success: false, error: err.message, results };
    }
}

module.exports = runTests;
