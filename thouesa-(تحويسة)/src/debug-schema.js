const pool = require('./db');

async function debugSchema() {
    const report = {};
    try {
        const [tables] = await pool.query('SHOW TABLES');
        
        for (const tableRow of tables) {
            const tableName = Object.values(tableRow)[0];
            const [schema] = await pool.query(`DESCRIBE ${tableName}`);
            report[tableName] = schema;
        }
        return report;
    } catch (err) {
        return { error: err.message };
    }
}

module.exports = debugSchema;
