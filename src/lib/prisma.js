import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ DATABASE_URL is not defined in .env file!");
}

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Neon in most environments
})

const adapter = new PrismaPg(pool)

// Export a single instance of PrismaClient to be used everywhere
export const prisma = new PrismaClient({ adapter })
