import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

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


let retrievalChain;
let basicRetrievalChain;

const isGreeting = (text) => {
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you', 'how are u', 'hii'];
    const cleaned = text.toLowerCase().trim().replace(/[^\w\s]/gi, '');
    return greetings.some(g => cleaned === g || cleaned.startsWith(g + ' '));
};

async function initLLM() {
    if (retrievalChain) {
        return { retrievalChain, basicRetrievalChain };
    }
    process.stdout.write("Initializing LLM Chain... ");
    console.time("llm_init");
    const embedding = new HuggingFaceInferenceEmbeddings({
        apiKey: process.env.HUGGINGFACEHUB_API_TOKEN,
        model: "sentence-transformers/all-MiniLM-L6-v2",
        provider: "hf-inference",
    });

    const originalEmbedQuery = embedding.embedQuery.bind(embedding);
    embedding.embedQuery = async (text) => {
        const start = Date.now();
        if (typeof text !== 'string') {
            console.log(">>> [DEBUG] Embedding text is NOT a string:", typeof text);
            console.dir(text, { depth: null });
        }
        const queryText = typeof text === 'string' ? text : (text?.input || JSON.stringify(text));
        const res = await originalEmbedQuery(queryText);
        console.log(`>>> [TIMING] 2.1 Hugging Face Query Embedding: ${Date.now() - start}ms`);
        return res;
    };

    const pc = new PineconeClient({
        apiKey: process.env.PINECONE_API_KEY,
    });

    const vectorStore = await PineconeStore.fromExistingIndex(
        embedding,
        { pineconeIndex: pc.Index(indexName) }
    );

    const retriever = vectorStore.asRetriever({
        searchType: "similarity",
        k: 2,
    });

    const originalGetDocs = retriever._getRelevantDocuments.bind(retriever);
    retriever._getRelevantDocuments = async (query, runManager) => {
        const start = Date.now();
        // If query is an object, similaritySearch might fail later if not handled.
        // We log it to help debug why basicRetrievalChain passes objects.
        const res = await originalGetDocs(query, runManager);
        console.log(`>>> [TIMING] 2.2 Pinecone Vector Search (Total): ${Date.now() - start}ms`);
        return res;
    };


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
You are Dr. Nura AI, a polite, friendly, and reliable healthcare assistant.

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

- Politely refuse to answer
- Gently guide the user back to health-related topics
- Do NOT give information about non-medical subjects

Example refusal style:
"I'm here to help with health and medical questions only.  
Please ask me something about symptoms, health, or medical care."

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

    basicRetrievalChain = await createRetrievalChain({
        retriever: retriever,
        combineDocsChain,
    });

    console.timeEnd("llm_init");

    return { retrievalChain, basicRetrievalChain };
}

export async function* getAIResponse(input, chatHistory = []) {
    const totalStart = Date.now();

    // ⚡ Fast Path: Greetings
    if (isGreeting(input)) {
        console.log(">>> [FAST PATH] Greeting detected. Jumping to instant response.");
        yield "Hello! I am Dr. Nura AI, your professional healthcare assistant. How can I help you with your health today?";
        return;
    }

    try {
        const { retrievalChain, basicRetrievalChain } = await initLLM();

        const isNewChat = chatHistory.length === 0;
        console.log(`>>> [LLM] Request started. History length: ${chatHistory.length}. New Chat: ${isNewChat}`);
        const streamRequestStart = Date.now();

        // Callbacks to see which internal part is slow
        const callbacks = [{
            handleRetrieverStart() { console.time(">>> [TIMING] 2. Pinecone Retrieval"); },
            handleRetrieverEnd() { console.timeEnd(">>> [TIMING] 2. Pinecone Retrieval"); },
            handleLLMStart(llm, prompts) {
                console.time(">>> [TIMING] 1. LLM Step (Rephrase/Answer)");
            },
            handleLLMEnd() { console.timeEnd(">>> [TIMING] 1. LLM Step (Rephrase/Answer)"); }
        }];

        // 🚀 Optimization: Skip rephrasing for new chats
        const chain = isNewChat ? basicRetrievalChain : retrievalChain;
        if (isNewChat) console.log(">>> [OPTIMIZATION] Skipping rephrase step for new conversation.");

        // ⏱️ Split Timing: Embedding vs Search
        // We can't easily split internal LangChain steps, but we can log when the LLM actually starts getting context.

        const stream = await chain.stream({
            input: input.toString(),
            chat_history: chatHistory,
        }, { callbacks });

        let firstChunk = true;
        for await (const chunk of stream) {
            if (chunk.answer !== undefined) {
                if (firstChunk) {
                    const timeToFirst = Date.now() - streamRequestStart;
                    console.log(`>>> [LLM] First chunk received from Groq. Internal delay: ${timeToFirst}ms`);
                    firstChunk = false;
                }
                yield chunk.answer;
            }
        }
        console.log(`>>> [LLM] Response complete. Internal processing time: ${Date.now() - totalStart}ms`);
    } catch (error) {
        console.error(">>> [LLM ERROR]:", error);
        throw new Error("Failed to get response from AI");
    }
}
