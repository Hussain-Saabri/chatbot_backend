import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const dataDir = path.join(__dirname, "../data/");
const indexName = "medical-chatbot2";

// 1. Load PDF
const loader = new DirectoryLoader(dataDir, {
    ".pdf": (path) => new PDFLoader(path),
});

console.log("Loading documents...");
const rawDocs = await loader.load();

// 2. Filter / Clean
const docs = rawDocs.map(doc => new Document({
    pageContent: doc.pageContent,
    metadata: { source: doc.metadata.source }
}));

// 3. Split Text
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 20,
});
const chunked_data = await textSplitter.splitDocuments(docs);
console.log(`Total chunks created: ${chunked_data.length}`);

// 4. Initialize Embeddings & Pinecone
const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "sentence-transformers/all-MiniLM-L6-v2",
});

const pc = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
});

// 5. Upload in Batched Chunks
console.log("Pushing to Pinecone in batches...");
const batchSize = 100;
for (let i = 0; i < chunked_data.length; i += batchSize) {
    const batch = chunked_data.slice(i, i + batchSize);
    console.log(`Uploading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunked_data.length / batchSize)}...`);

    if (i === 0) {
        await PineconeStore.fromDocuments(batch, embeddings, {
            pineconeIndex: pc.Index(indexName),
        });
    } else {
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: pc.Index(indexName),
        });
        await vectorStore.addDocuments(batch);
    }
}

console.log("Ingestion Complete!");
