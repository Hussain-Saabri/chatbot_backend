import 'dotenv/config';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

console.log("🚀 Testing raw PG connection...");
console.log("🔗 URL:", connectionString.split('@')[1]); // Log only the host/path part

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Common requirement for Neon
});

try {
    const client = await pool.connect();
    console.log("✅ Successfully connected to Postgres with raw 'pg'!");
    const res = await client.query('SELECT NOW()');
    console.log("🕒 DB Time:", res.rows[0].now);
    client.release();
} catch (err) {
    console.error("❌ Raw connection failed:", err.message);
    if (err.stack) console.error(err.stack);
} finally {
    await pool.end();
    console.log("🔌 Pool closed.");
}
