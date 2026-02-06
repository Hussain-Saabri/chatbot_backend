import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { prisma } from './lib/prisma.js';

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });


const app = express();
const PORT = process.env.PORT || 5000;
console.log("Starting server...");
console.log("Port:", PORT);
console.log("DATABASE_URL present:", !!process.env.DATABASE_URL);
console.log("OPENAI_API present:", !!process.env.OPENAI_API);

// Middleware
app.use(cors());
app.use(express.json());


// Routes

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes)
app.use('/api/health', healthRoutes)

// Basic health check
app.get('/', (req, res) => {
    res.send('Chatbot API is running...');
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Force the event loop to stay active
// This prevents "clean exit" in some Windows/Nodemon environments
setInterval(() => { }, 1000 * 60 * 60);

