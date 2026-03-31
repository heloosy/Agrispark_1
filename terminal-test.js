require('dotenv').config();
const readline = require('readline');
const ai = require('./services/ai');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function runTerminalTest() {
  console.log("==========================================");
  console.log("🌽 SMART FARMING ASSISTANT (TERMINAL MODE)");
  console.log("==========================================\n");

  console.log("🤖 AI: Welcome to Smart Farming Assistant.");
  console.log("       For a quick question, press 1.");
  console.log("       For complete farming guidance, press 2.\n");

  const choice = await askQuestion("You (Type 1 or 2): ");

  if (choice.trim() === '1') {
    // QUICK QUERY MODE
    console.log("\n🤖 AI: Please tell your question.");
    const query = await askQuestion("You: ");
    
    console.log("\n[Thinking... Calling Gemini AI...]\n");
    try {
      const aiResponse = await ai.getQuickResponse(query);
      console.log("🗣️ AI VOICE TRANSCRIPT:");
      console.log(aiResponse);
    } catch (e) {
      console.error("\n[Error calling AI in Quick Mode]:", e.message);
    }
    
  } else if (choice.trim() === '2') {
    // FULL GUIDANCE MODE
    console.log("\n🤖 AI: Great. Let's get started.");
    
    const name = await askQuestion("🤖 AI: What is your name?\nYou: ");
    const location = await askQuestion("\n🤖 AI: Where is your farm located? (Village/District)\nYou: ");
    const crop = await askQuestion("\n🤖 AI: What crop are you currently growing?\nYou: ");
    const stage = await askQuestion("\n🤖 AI: What stage is your crop at? (Sowing, Growing, Flowering, Harvest)\nYou: ");
    
    console.log("\n-- To test WhatsApp integration, we need your number --");
    const phone = await askQuestion("🤖 AI: What is your WhatsApp number? (Include +91)\nYou: ");

    console.log("\n[Thinking... Generating full plan via Gemini AI...]\n");
    
    try {
      const formData = { name, location, crop, stage };
      const plan = await ai.generateFullPlan(formData);

      console.log("📱 WHATSAPP MESSAGE OUTPUT:\n");
      console.log(plan);
      console.log("\n------------------------------------------");

      console.log("\n🚀 [Sending real WhatsApp message to " + phone + "...]");
      const twilio = require('twilio');
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      let toWhatsApp = phone.startsWith('whatsapp:') ? phone : 'whatsapp:' + phone;
      
      await twilioClient.messages.create({
        body: plan,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: toWhatsApp
      });

      console.log("✅ Message successfully sent to your WhatsApp!");

    } catch (e) {
      console.error("\n[Error in Full Plan Mode]:", e.message);
      console.log("\nDid you remember to text 'join strict-zebra' (or your sandbox join code) to your Twilio number from WhatsApp first?");
    }
    
  } else {
    console.log("\nInvalid choice. Goodbye!");
  }

  rl.close();
  process.exit(0);
}

runTerminalTest();
