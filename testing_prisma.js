import { prisma } from './lib/prisma.js';

async function main() {
    console.log("Testing Prisma connection...");
    try {
        const users = await prisma.user.findMany({ take: 1 });
        console.log("Success! Prisma connected. Users found:", users.length);
    } catch (error) {
        console.error("❌ Prisma test failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
