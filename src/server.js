import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { prisma } from './lib/prisma.js';

import { HumanMessage, AIMessage } from "@langchain/core/messages";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
