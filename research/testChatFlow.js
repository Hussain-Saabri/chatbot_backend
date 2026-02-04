import { prisma } from "../src/lib/prisma.js";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testChatFlow() {
    console.log("🚀 Starting chat flow verification...");

    try {
        // 1. Get a real user to "login"
        console.log("🔍 Finding a user...");
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error("❌ No users found. Please run addUser.js first.");
            return;
        }

        // 2. Generate a "token" (simulating a real session)
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log(`✅ Token generated for user: ${user.email}`);

        // 3. Simulate first message (auto-create conversation)
        console.log("\n💬 Simulating first message...");
        const firstMessageContent = "I feel like I have a fever.";

        // This logic mimics the sendMessage controller
        const newConversation = await prisma.conversation.create({
            data: {
                userId: user.id,
                title: firstMessageContent.substring(0, 30),
            }
        });
        console.log("✅ Conversation auto-created:", newConversation.id);

        await prisma.message.create({
            data: {
                conversationId: newConversation.id,
                sender: "user",
                content: firstMessageContent,
            }
        });
        console.log("✅ User message stored.");

        await prisma.message.create({
            data: {
                conversationId: newConversation.id,
                sender: "ai",
                content: "I'm sorry to hear that. How high is your temperature?",
            }
        });
        console.log("✅ AI response stored.");

        // 4. Verify retrieval
        console.log("\n🔍 Verifying message retrieval...");
        const messages = await prisma.message.findMany({
            where: { conversationId: newConversation.id },
            orderBy: { createdAt: 'asc' }
        });

        console.log(`✅ Found ${messages.length} messages in conversation:`);
        messages.forEach(m => {
            console.log(`   [${m.sender.toUpperCase()}]: ${m.content}`);
        });

    } catch (error) {
        console.error("❌ Chat flow test failed:", error);
    } finally {
        await prisma.$disconnect();
        console.log("\n🔌 Disconnected.");
    }
}

testChatFlow();
