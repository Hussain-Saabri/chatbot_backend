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
console.log("retrievalChain", retrievalChain);

async function initLLM() {
    console.log("Inside initLLM function");
    if (retrievalChain == null) {
        console.log("Retrieval chain not initialized.");
    }
    if (retrievalChain) {
        console.log("Retrieval chain already initialized.");
        return retrievalChain;
    }
    process.stdout.write("Initializing LLM Chain... ");
    console.time("llm_init");
    const embedding = new HuggingFaceInferenceEmbeddings({
        apiKey: process.env.HUGGINGFACEHUB_API_TOKEN,
        model: "sentence-transformers/all-MiniLM-L6-v2",
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
        k: 4,
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
    console.log("rephrase prompt created.", rephrasePrompt);
    console.log("system prompt creating.");
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
    console.log("system prompt created.", systemPrompt);

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



    return retrievalChain;
}

export async function* getAIResponse(input, chatHistory = []) {
    try {
        console.log("Inside getAIResponse function");


        const chain = await initLLM();

        const stream = await chain.stream({
            input,
            chat_history: chatHistory,
        });



        let firstChunk = true;
        for await (const chunk of stream) {
            if (chunk.answer) {
                if (firstChunk) {

                    firstChunk = false;
                }
                yield chunk.answer;
            }
        }
    } catch (error) {

        throw new Error("Failed to get response from AI");
    }
}


