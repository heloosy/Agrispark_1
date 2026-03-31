require('dotenv').config();
const ai = require('./services/ai');

async function test() {
    console.log("Testing getWhatsAppChatResponse with 'why is my maize leave purple'...");
    try {
        const response = await ai.getWhatsAppChatResponse("why is my maize leave purple");
        console.log("Response:", response);
    } catch (error) {
        console.error("Caught error:", error);
    }

    console.log("\nTesting generateFullPlan...");
    try {
        const plan = await ai.generateFullPlan({
            name: "Jacob",
            location: "Tokyo",
            crop: "Rice",
            stage: "Sowing"
        });
        console.log("Plan:", plan);
    } catch (error) {
        console.error("Caught error:", error);
    }
}

test();
