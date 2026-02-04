import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { BufferMemory } from "langchain/memory";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { PromptTemplate } from "@langchain/core/prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const indexName = "medical-chatbot2";

// Setup
const embedding = new HuggingFaceTransformersEmbeddings({
    model: "sentence-transformers/all-MiniLM-L6-v2",
});

const pc = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
});

const vectorStore = await PineconeStore.fromExistingIndex(
    embedding,
    { pineconeIndex: pc.Index(indexName) }
);

// --- Your Simple Code Start ---
const retriever = vectorStore.asRetriever({
    searchType: "similarity",
    k: 3,
});
//Create memory object
const memory = new BufferMemory({
    returnMessages: true,
    memoryKey: "chat_history",
});

const rephrasePrompt = PromptTemplate.fromTemplate(`
Chat history:
{chat_history}

User question:
{input}

Rewrite the question clearly as a full medical question:
`);


//initilsing the llm model
const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    apiKey: process.env.GROQ_API_KEY,
});
// --- High-Level Retrieval Chain Implementation ---

const systemPrompt = `
You are Dr. Nova AI, a polite, friendly, and reliable healthcare assistant.

Your role is to answer ONLY medical and health-related questions.

--------------------------------------------------

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




// 1. Create the Combine Documents chain (Stuff Documents)
const combineDocsChain = await createStuffDocumentsChain({
    llm: llm,
    prompt: prompt,
});

// 2. Create the Retrieval Chain
const retrievalChain = await createRetrievalChain({
    retriever: historyAwareRetriever,
    combineDocsChain,
    memory,
});

// Question 1
const query1 = "What is uric acid ?";
const memoryVars1 = await memory.loadMemoryVariables({});
const response1 = await retrievalChain.invoke({
    input: query1,
    ...memoryVars1,
});

await memory.saveContext(
    { input: query1 },
    { output: response1.answer }
);

console.log("\nAnswer 1:");
console.log(response1.answer);


// Question 2
const query2 = "What are its treatments?";
// Load history from memory
const memoryVars2 = await memory.loadMemoryVariables({});

const response2 = await retrievalChain.invoke({
    input: query2,
    ...memoryVars2,
});

await memory.saveContext(
    { input: query2 },
    { output: response2.answer }
);

console.log("\nAnswer 2:");
console.log(response2.answer);


// See stored memory
console.log("\nStored chat history:");
console.log(memory.chatHistory.messages);

