const pool = require('./src/db');

async function checkReviews() {
    try {
        const [users] = await pool.query('SELECT id, full_name, phone FROM users');
        console.log('Users in DB:', users);

        const [reviews] = await pool.query('SELECT r.*, u.full_name FROM reviews r LEFT JOIN users u ON r.user_id = u.id');
        console.log('Reviews in DB:', reviews);
        
        process.exit(0);
    } catch (err) {
        console.error('Error checking reviews:', err);
        process.exit(1);
    }
}

checkReviews();
