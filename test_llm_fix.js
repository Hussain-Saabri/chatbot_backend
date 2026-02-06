import { getAIResponse } from './src/lib/llm.js';

async function test() {
    const query = "What is diabetes?";
    console.log(`\n--- Testing: "${query}" ---`);
    try {
        const stream = getAIResponse(query);
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log("\n[DONE]");
    } catch (error) {
        console.error("\nFAIL:", error.message);
    }
}

test();
