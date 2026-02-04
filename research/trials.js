import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

console.log("Hello World!");

const loaderMap = {
    ".pdf": (path) => new PDFLoader(path),
};
export async function load_pdf_files(dataDir) {
    const loader = new DirectoryLoader(dataDir, loaderMap);
    console.log("laoder which i got", loader)
    const documents = await loader.load();
    return documents;
}

const extracted_data = await load_pdf_files("../data/");

export function filter_to_minimal_docs(docs) {
    return docs.map(doc => {
        return new Document({
            pageContent: doc.pageContent, // Asli text waisa hi rakha
            metadata: {
                source: doc.metadata.source // Sirf source rakha, baaki sab hata diya
            }
        });
    });
}

const filtered_data = filter_to_minimal_docs(extracted_data);


export async function text_split(minimal_docs) {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 20,
    });

    const texts_chunk = await textSplitter.splitDocuments(minimal_docs);
    return texts_chunk;
}

const chunked_data = await text_split(filtered_data);
console.log("length of chunked data", chunked_data.length);

//downloading the vector embeddings

export function download_embeddings() {
    const embeddings = new HuggingFaceTransformersEmbeddings({
        model: "sentence-transformers/all-MiniLM-L6-v2",
    });
    return embeddings;
}
const embedding = download_embeddings();
// 1. Pinecone Client Initialize karein
const pc = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
});

const indexName = "medical-chatbot2"; // Aapka Pinecone Index Name

// 2. Data ko Pinecone mein bhejene ka function
console.log("Pushing to Pinecone in batches...");

const batchSize = 10;
for (let i = 0; i < chunked_data.length; i += batchSize) {
    const batch = chunked_data.slice(i, i + batchSize);
    console.log(`Uploading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunked_data.length / batchSize)}...`);

    if (i === 0) {
        // Pehli baar mein Index initialize hota hai
        await PineconeStore.fromDocuments(
            batch,
            embedding,
            {
                pineconeIndex: pc.Index(indexName),
            }
        );
    } else {
        // Baaki chunks ko add karne ke liye .addDocuments use karein
        const vectorStore = await PineconeStore.fromExistingIndex(
            embedding,
            {
                pineconeIndex: pc.Index(indexName),
            }
        );
        await vectorStore.addDocuments(batch);
    }
}

console.log("Data successfully uploaded to Pinecone!");

//adding new data to pinecone

async function addCustomData(text, source) {
    const customDoc = new Document({
        pageContent: text,
        metadata: { source: source }
    });

    const vStore = await PineconeStore.fromExistingIndex(
        embedding,
        { pineconeIndex: pc.Index(indexName) }
    );

    await vStore.addDocuments([customDoc]);
    console.log("Custom data added successfully!");
}


await addCustomData("My name is Hussain Saabri and I stay in Goa.", "Local");