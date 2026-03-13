const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const initDB = require('./src/init-db');
require('dotenv').config();

console.log('--- Thouesa Server Starting ---');
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for express-rate-limit behind cPanel/Nginx
app.set('trust proxy', 1);
console.log('Express setting: trust proxy enabled');

// Logging
app.use(morgan('dev'));
console.log('Middleware initialized: morgan');

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for simplicity in this environment
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    validate: { trustProxy: false }, // We've already set app.set('trust proxy', 1)
});
app.use('/api/', limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
console.log('Middleware initialized: cors, json, urlencoded');

// Static files
app.use(express.static(path.join(__dirname, 'web')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('Static files routes initialized');

// Initialize Database
console.log('Initializing database...');
initDB().then(() => {
    console.log('Database initialization process completed.');
}).catch(err => {
    console.error('CRITICAL: Database initialization failed:', err);
});

// Debug Test Route (Internal use)
const runTests = require('./src/test-suite');
const debugSchema = require('./src/debug-schema');

app.get('/api/v1/debug/run-tests', async (req, res) => {
    try {
        const results = await runTests();
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/v1/debug/schema', async (req, res) => {
    try {
        const report = await debugSchema();
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routes
const authRoutes = require('./src/routes/auth');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const customerRoutes = require('./src/routes/customer');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/customer', customerRoutes);
console.log('API routes initialized');

// Fallback for SPA-like behavior if needed, but we have specific HTML files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'web', 'index.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'web', 'client.html')));
app.get('/gate77', (req, res) => res.sendFile(path.join(__dirname, 'web', 'gate77.html')));

// cPanel/Passenger compatibility: If PORT is not a number, it's likely a socket path.
// In that case, we should not specify a host (like '0.0.0.0').
const isSocket = isNaN(Number(PORT));
let server;

if (isSocket) {
    const fs = require('fs');
    if (fs.existsSync(PORT)) {
        try {
            fs.unlinkSync(PORT);
            console.log(`Removed stale socket file: ${PORT}`);
        } catch (err) {
            console.error(`Failed to remove stale socket file: ${PORT}`, err);
        }
    }
    server = app.listen(PORT, () => console.log(`Thouesa Server running on socket: ${PORT}`));
} else {
    server = app.listen(PORT, '0.0.0.0', () => console.log(`Thouesa Server running on port: ${PORT}`));
}

// Handle server errors to prevent crash
server.on('error', (err) => {
    console.error('SERVER ERROR:', err);
    if (err.code === 'EADDRINUSE' && isSocket) {
        console.error(`Socket ${PORT} is already in use. Please check for running processes.`);
    }
});
