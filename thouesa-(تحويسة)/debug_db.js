const pool = require('./src/db');

async function debugSchema() {
    try {
        const [tables] = await pool.query('SHOW TABLES');
        
        for (const tableRow of tables) {
            const tableName = Object.values(tableRow)[0];
            const [schema] = await pool.query(`DESCRIBE ${tableName}`);
            console.log(`\n--- ${tableName} ---`);
            console.table(schema);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugSchema();
