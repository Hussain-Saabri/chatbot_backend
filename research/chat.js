import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const indexName = "medical-chatbot2";

// 1. Setup Embeddings & Client
const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "sentence-transformers/all-MiniLM-L6-v2",
});

const pc = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
});

async function askChatbot(query) {
    console.log(`\nAnalyzing Question: ${query}`);

    const vStore = await PineconeStore.fromExistingIndex(
        embeddings,
        { pineconeIndex: pc.Index(indexName) }
    );

    // 2. Retriever Create Karein (search_type="similarity", k=3)
    const retriever = vStore.asRetriever({
        k: 3,
        searchType: "similarity"
    });

    // 3. Invoke Retriever (Context dhoondhna)
    console.log("Fetching top 3 relevant chunks from Pinecone...");
    const results = await retriever.invoke(query);

    console.log("\n--- KNOWLEDGE BASE CONTEXT ---");
    results.forEach((res, i) => {
        console.log(`\n[Result ${i + 1}] [Source: ${res.metadata.source}]`);
        console.log(`Content: ${res.pageContent.substring(0, 300)}...`);
    });
}

// Test Query
const userQuestion = process.argv[2] || "What are the common symptoms of Allergies?";
await askChatbot(userQuestion).catch(err => console.error("Error:", err));
