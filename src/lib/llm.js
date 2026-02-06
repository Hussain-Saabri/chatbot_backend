import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { PromptTemplate } from "@langchain/core/prompts";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const indexName = "medical-chatbot2";

// Singleton setup
let retrievalChain;

async function initLLM() {
    if (retrievalChain) return retrievalChain;
    process.stdout.write("Initializing LLM Chain... ");
    console.time("llm_init");

    const embedding = new HuggingFaceTransformersEmbeddings({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        // Silence dtype warning by being explicit
        modelOptions: {
            dtype: "fp32",
        }
    });

    const pc = new PineconeClient({
        apiKey: process.env.PINECONE_API_KEY,
    });

    const vectorStore = await PineconeStore.fromExistingIndex(
        embedding,
        { pineconeIndex: pc.Index(indexName) }
    );

    const retriever = vectorStore.asRetriever({
        searchType: "similarity",
        k: 3,
    });

    const llm = new ChatGroq({
        model: "llama-3.1-8b-instant",
        temperature: 0.4,
        apiKey: process.env.GROQ_API_KEY,
        streaming: true,
    });

    const rephrasePrompt = PromptTemplate.fromTemplate(`
Chat history:
{chat_history}

User question:
{input}

Rewrite the question clearly as a full medical question:
`);

    const systemPrompt = `
You are Dr. Nova AI, a polite, friendly, and reliable healthcare assistant.

Your role is to answer ONLY medical and health-related questions.

------------------------------------------------------

LANGUAGE & TONE:
- Use simple English
- Be calm, kind, friendly, and respectful
- Explain things in a way a 10-year-old can understand
- Keep answers clear and short
- Use bullet points when helpful

--------------------------------------------------

YOU SHOULD ANSWER ONLY QUESTIONS ABOUT:
- Symptoms, illnesses, and health problems
- Medical reports and test results
- Human body and general healthcare
- Basic healthy habits and safety tips

--------------------------------------------------

IF A QUESTION IS NOT MEDICAL:
- Give a polite, ONE-LINE refusal only.
- STRICTLY DO NOT provide any information about the non-medical topic (e.g., if asked about a country, do NOT mention its location or facts).
- Example: "I am here to help with health and medical questions only. Please ask me about symptoms, medical reports, or general healthcare."

--------------------------------------------------

MEDICAL SAFETY RULES:
- Never make up medical facts
- Do not prescribe strong medicines
- Avoid dangerous advice
- If symptoms seem serious, suggest seeing a doctor

--------------------------------------------------

WHEN CONTEXT IS PROVIDED:
- Use it to answer medical questions clearly
- If unsure, say you don’t know
If no context is provided or the context is empty:
- Do NOT assume any previous medical information
- Do NOT invent or guess any situation
- Answer only based on the user’s current question
Never refer to past conversations unless the context clearly includes them.
Do not create examples of previous medical situations.

--------------------------------------------------

Context:
{context}
`;

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["placeholder", "{chat_history}"],
        ["human", "{input}"]
    ]);

    const historyAwareRetriever = await createHistoryAwareRetriever({
        llm,
        retriever,
        rephrasePrompt,
    });

    const combineDocsChain = await createStuffDocumentsChain({
        llm,
        prompt,
    });

    retrievalChain = await createRetrievalChain({
        retriever: historyAwareRetriever,
        combineDocsChain,
    });

    console.timeEnd("llm_init");
    console.log("LLM Chain ready.");
    return retrievalChain;
}

export async function* getAIResponse(input, chatHistory = []) {
    try {
        const chain = await initLLM();
        console.log("Starting stream for input:", input);
        console.time("first_chunk_latency");
        const stream = await chain.stream({
            input,
            chat_history: chatHistory,
        });

        let firstChunk = true;
        for await (const chunk of stream) {
            if (chunk.answer) {
                if (firstChunk) {
                    console.timeEnd("first_chunk_latency");
                    console.log("Stream started yielding chunks.");
                    firstChunk = false;
                }
                yield chunk.answer;
            }
        }
    } catch (error) {
        console.error("LLM Error:", error);
        throw new Error("Failed to get response from AI");
    }
}


