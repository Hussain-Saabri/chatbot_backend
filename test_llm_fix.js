import { getAIResponse } from './src/lib/llm.js';

async function test() {
    console.log("Starting LLM test...");
    try {
        const stream = getAIResponse("Explain what a fever is in simple terms.");
        console.log("Stream started, waiting for chunks...");

        let fullResponse = "";
        for await (const chunk of stream) {
            process.stdout.write(chunk);
            fullResponse += chunk;
        }

        console.log("\n\nTest complete!");
        if (fullResponse.length > 0) {
            console.log("PASS: Received a response from AI.");
        } else {
            console.log("FAIL: Received an empty response from AI.");
        }
    } catch (error) {
        console.error("FAIL: Error during LLM test:", error.message);
        process.exit(1);
    }
}

test();
