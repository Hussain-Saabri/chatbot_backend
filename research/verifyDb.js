import { prisma } from "../src/lib/prisma.js";

async function main() {
    console.log("🚀 Starting database verification...");

    try {
        // Find an existing user to use for the conversation
        console.log("🔍 Finding a user in the database...");
        const user = await prisma.user.findFirst();
        console.log("✅ User found:", user);
        // const conversation = await prisma.Conversation.create({
        //     data:{
        //         userId:user.id,
        //         title:"Conversation 1"
        //     }
        // })
        // console.log("✅ Conversation created:", conversation);
        // const message =await prisma.Message.create({
        //     data:{
        //         conversationId:"cf9d027b-1d54-4bc4-80fa-7c6fcba18c9f",
        //         sender:"AI",
        //         content:"Hello, how are you?"
        //     }
        // })
        const allConversations = await prisma.Message.findMany({
            where:{
                conversationId:"cf9d027b-1d54-4bc4-80fa-7c6fcba18c9f"
            },
            orderBy:{
                createdAt:"asc"
            }
        });
        console.log("✅ All conversations:", allConversations);
    } catch (error) {
        console.error("❌ Database verification failed:", error);
    } 

}

main();
