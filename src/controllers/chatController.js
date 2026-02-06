import { prisma } from '../lib/prisma.js';
import { getAIResponse } from '../lib/llm.js';
import { HumanMessage, AIMessage } from "@langchain/core/messages";


const saveChatMessage = async (conversationId, sender, content) => {
    return prisma.message.create({
        data: { conversationId, sender, content }
    });
};

export const sendMessage = async (req, res) => {
    const { content, conversationId } = req.body;
    const userId = req.user.userId;
    console.log(`>>> Incoming Request: user=${userId}, content="${content?.substring(0, 30)}..."`);

    try {
        if (!content) {
            return res.status(400).json({ error: "Message content is required" });
        }

        let conversation;
        let chatHistory = [];

        // 1. Handle Conversation & Fetch History
        if (conversationId) {
            conversation = await prisma.conversation.findUnique({
                where: { id: conversationId }
            });

            if (!conversation || conversation.userId !== userId) {
                return res.status(404).json({ error: "Conversation not found" });
            }

            const historyMessages = await prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'asc' },
                take: -15 // Fetch only last 15 messages for context
            });

            chatHistory = historyMessages.map(msg =>
                msg.sender === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content)
            );
        } else {
            conversation = await prisma.conversation.create({
                data: {
                    userId,
                    title: content.substring(0, 30) + (content.length > 30 ? "..." : ""),
                }
            });
        }

        // 2. Save User Message
        saveChatMessage(conversation.id, "user", content).catch(err => console.error("BG Save Error:", err));

        // 3. Set Headers and Stream Response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('x-conversation-id', conversation.id);
        res.setHeader('Access-Control-Expose-Headers', 'x-conversation-id');

        // Disable buffering for smooth streaming
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Crucial for Nginx/Proxies

        let fullAIResponse = "";
        const stream = getAIResponse(content, chatHistory);

        for await (const chunk of stream) {
            res.write(chunk);
            fullAIResponse += chunk;
        }

        // 4. Save AI Message
        await saveChatMessage(conversation.id, "ai", fullAIResponse);

        res.end();

    } catch (error) {
        console.error("Chat error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        } else {
            res.end();
        }
    }
};


export const getConversations = async (req, res) => {
    const userId = req.user.userId;
    try {
        const conversations = await prisma.conversation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(conversations);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMessages = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id }
        });

        if (!conversation || conversation.userId !== userId) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' }
        });

        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};