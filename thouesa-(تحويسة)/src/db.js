const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

try {
    const dbUrl = process.env.DATABASE_URL;
    
    if (dbUrl) {
        let connectionString = dbUrl;
        if (!connectionString.startsWith('mysql://')) {
            connectionString = 'mysql://' + connectionString;
        }
        // Append charset if not present
        if (!connectionString.includes('charset=')) {
            connectionString += (connectionString.includes('?') ? '&' : '?') + 'charset=utf8mb4';
        }
        pool = mysql.createPool(connectionString);
    } else if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            connectTimeout: 10000,
            charset: 'utf8mb4'
        });
    } else {
        console.error('------------------------------------------------------------------');
        console.error('CRITICAL ERROR: DATABASE_URL is not defined!');
        console.error('Please go to Settings -> Environment Variables and add:');
        console.error('DATABASE_URL=mysql://user:password@your-host:3306/database_name');
        console.error('------------------------------------------------------------------');
        
        // Fallback to localhost for development
        pool = mysql.createPool({
            host: '127.0.0.1',
            user: 'root',
            password: '',
            database: 'thouesa',
            connectTimeout: 10000,
            charset: 'utf8mb4'
        });
    }

    // Test connection immediately
    pool.getConnection()
        .then(conn => {
            console.log('✅ Database connected successfully');
            conn.release();
        })
        .catch(err => {
            console.error('❌ Database connection failed!');
            console.error('Error Details:', err.message);
            
            if (err.code === 'ECONNREFUSED') {
                console.error('\n------------------------------------------------------------------');
                console.error('HINT: The application is trying to connect to a local MySQL server (127.0.0.1:3306),');
                console.error('but none was found. Please ensure your database is running and accessible.');
                console.error('------------------------------------------------------------------\n');
            }
        });

} catch (err) {
    console.error('❌ CRITICAL ERROR: Failed to initialize database pool!');
    console.error('Error Details:', err.message);
    console.error('Please check your DATABASE_URL format.');
    
    // Create a dummy pool to prevent immediate crashes in other files
    pool = {
        query: async () => { throw new Error('Database pool not initialized due to invalid configuration.'); },
        getConnection: async () => { throw new Error('Database pool not initialized due to invalid configuration.'); }
    };
}

module.exports = pool;
