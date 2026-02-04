import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Document } from "@langchain/core/documents";
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

async function addCustomData(text, source) {
    console.log(`Adding new data: "${text.substring(0, 30)}..."`);

    const customDoc = new Document({
        pageContent: text,
        metadata: { source: source }
    });

    const vStore = await PineconeStore.fromExistingIndex(
        embeddings,
        { pineconeIndex: pc.Index(indexName) }
    );

    await vStore.addDocuments([customDoc]);
    console.log("Data added successfully!");
}

// Example usage:
await addCustomData("Hussain Saabri is an AI Developer based in Goa.", "Manual_Update");
