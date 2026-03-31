require('dotenv').config();
const ai = require('./services/ai');

async function runSimulation() {
    console.log("🚀 STARTING SIMULTANEOUS FARMING ASSISTANT SIMULATION\n");

    // ---------------------------------------------------------
    // TEST CASE 1: IVR Guided Flow + WhatsApp Follow-up (Rice)
    // ---------------------------------------------------------
    console.log("--- TEST CASE 1: Alice (Rice, Sowing, Philippines) ---");
    console.log("[IVR Simulation]: Collecting data...");
    const aliceData = { name: "Alice", location: "Laguna, Philippines", crop: "Paddy Rice", stage: "Sowing" };
    console.log("[AI]: Generating WhatsApp Plan for Alice...");
    const alicePlan = await ai.generateFullPlan(aliceData);
    console.log("Alice's WhatsApp Plan:\n", alicePlan);
    
    console.log("\n[WhatsApp Simulation]: Alice asks a follow-up...");
    const aliceHistory = [{ role: 'user', parts: [{ text: `Hi, I am Alice. I just received my plan for rice in Philippines.` }] }, { role: 'model', parts: [{ text: alicePlan }] }];
    const aliceFollowUp = await ai.getWhatsAppChatResponse("Should I use DAP or Urea for the first application?", aliceHistory);
    console.log("AI Response to Alice's follow-up:\n", aliceFollowUp);
    console.log("\n---------------------------------------------------------\n");

    // ---------------------------------------------------------
    // TEST CASE 2: WhatsApp Vision Query (Maize)
    // ---------------------------------------------------------
    console.log("--- TEST CASE 2: Bob (Maize, Zambia, Image Upload) ---");
    console.log("[WhatsApp Simulation]: Bob sends a photo of purple leaves...");
    const bobQuery = "Why are my maize leaves turning purple like this?";
    const bobImageUrl = "https://example.com/purple-maize-leaf.jpg"; // Simulated URL
    const bobDiagnosis = await ai.getWhatsAppChatResponse(bobQuery, [], bobImageUrl);
    console.log("AI Diagnosis for Bob's Maize:\n", bobDiagnosis);
    console.log("\n---------------------------------------------------------\n");

    // ---------------------------------------------------------
    // TEST CASE 3: IVR Quick Query (Coffee)
    // ---------------------------------------------------------
    console.log("--- TEST CASE 3: Charlie (Coffee, Quick Question) ---");
    console.log("[IVR Simulation]: Charlie asks a quick question...");
    const charlieQuestion = "My coffee berries are falling off before ripening in Ethiopia.";
    console.log("[AI]: Thinking...");
    const charlieResponse = await ai.getQuickResponse(charlieQuestion);
    console.log("AI Voice Transcript for Charlie:\n", charlieResponse);
    console.log("\n---------------------------------------------------------\n");

    console.log("✅ SIMULATION COMPLETE.");
}

runSimulation();
