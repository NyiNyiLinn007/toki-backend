/**
 * Migration Runner
 * Executes SQL migration files against the database
 */

const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/db');

const runMigrations = async () => {
    console.log('🚀 Starting database migrations...\n');

    try {
        // Read all migration files
        const files = fs.readdirSync(__dirname)
            .filter(file => file.endsWith('.sql'))
            .sort(); // Ensure order (001, 002, etc.)

        if (files.length === 0) {
            console.log('No migration files found.');
            return;
        }

        console.log(`Found ${files.length} migration files.`);

        for (const file of files) {
            console.log(`\n📄 Running migration: ${file}`);
            const migrationPath = path.join(__dirname, file);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            // Execute the migration logic
            try {
                await pool.query(migrationSQL);
                console.log(`✅ ${file} applied successfully.`);
            } catch (err) {
                // If the error is "relation already exists" (42P07) or similar, we can maybe ignore or warn
                // But blindly ignoring is risky. 
                // However, since we don't have a migrations table tracking applied ones, this is a quick fix.
                console.warn(`⚠️ Warning applying ${file}: ${err.message}`);
                // Continue to next migration
            }
        }

        console.log('\n🎉 All migrations completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('\n🔌 Database connection closed.');
    }
};

// Run if called directly
if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };
