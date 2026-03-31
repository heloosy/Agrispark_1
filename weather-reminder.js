require('dotenv').config();
const cron = require('node-cron');
const twilio = require('twilio');
const { GoogleGenAI } = require('@google/genai');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In a real application, you would pull this list from your database
const subscribedFarmers = [
  {
    name: "Farmer Sylvia",
    phone: "whatsapp:+917736215631", 
    location: "Ernakulam, India",
    crop: "Paddy",
    stage: "Sowing"
  }
];

// In a real application, you would call a Weather API (like OpenWeatherMap) here based on farmer.location.
// For this prototype, we simulate a severe weather event!
function getLocalWeatherForecast(location) {
   return "Heavy unexpected rain and high humidity expected over the next 48 hours.";
}

async function checkWeatherAndSendAlert(farmer) {
  try {
    console.log(`\n[Pulling Weather for ${farmer.location}...]`);
    const weather = getLocalWeatherForecast(farmer.location);
    
    console.log(`[Asking Gemini AI to analyze climate risk for ${farmer.crop}...]`);
    
    const prompt = `
    You are an AI agricultural assistant monitoring crop weather.
    The farmer ${farmer.name} is growing ${farmer.crop} at the ${farmer.stage} stage in ${farmer.location}.
    
    URGENT WEATHER FORECAST: ${weather}
    
    Analyze the exact risk this weather poses to the crop at this specific stage.
    Generate a highly urgent, short WhatsApp alert (UNDER 600 CHARACTERS) telling them exactly what to do to protect their crop today. 
    Use emojis. 
    Format it exactly like:
    🚨 CLIMATE ALERT: [Risk Summary]
    🛡 ACTION REQUIRED: [1-2 bullet points of what to do right now]
    `;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const alertMessage = response.text;
    console.log("📱 NEW AI WEATHER ALERT GENERATED:");
    console.log(alertMessage);

    // Send the WhatsApp Message
    await twilioClient.messages.create({
      body: alertMessage,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: farmer.phone
    });
    
    console.log(`✅ Alert successfully delivered to WhatsApp!`);

  } catch (error) {
    console.error("Failed to send weather alert:", error.message);
  }
}

// ==========================================
// BACKGROUND REMINDER SCHEDULER
// ==========================================

console.log("🌦️ Climate Reminder Background Service Started!");
console.log("It will check the weather and text farmers automatically.");

// Schedules the task using cron format.
// "0 8 * * *" means "Run every day at 8:00 AM".
// We have switched from '*/1 * * * *' (test mode) to '0 8 * * *' (daily at 8 AM).
cron.schedule('0 8 * * *', () => {
  console.log("\n⏰ Running Scheduled Morning Climate Check...");
  subscribedFarmers.forEach(farmer => {
     checkWeatherAndSendAlert(farmer);
  });
});
