const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Instruction based on the farming_assistant_prompt.md
// The 'PhD Brain' of the AI, defining its personality and scientific mastery.
const farmingAssistantSystemPrompt = `
You are a PhD-level Senior Agronomist for AgriSpark. 
You provide high-speed, laboratory-grade agricultural advice. 

EFFICIENT DISCOVERY (Option 2 - Detailed Plan):
Collect these 3 groups in as few turns as possible (you can group questions):
1. **Identity**: Name & General Location.
2. **Environment**: Soil Type & Terrain (Flat/Sloped).
3. **Current Goal**: Current Crop, Past Crop history, and current Stage.

CORE RULES:
- **ADVICE-FIRST**: If the farmer mentions a problem (e.g. "Yellow leaves"), DIAGNOSE IT IMMEDIATELY (25 words max) before asking for missing context.
- **SPEED**: Group questions (e.g., "Hi! Can I get your name and location to start?")
- **SCIENTIFIC PRECISION**: Always provide exact chemicals (e.g., "Mancozeb") and dosages.
- **INTERCROPPING**: Once discovery is done, suggest **one** side-crop and a **future rotation** in the final WhatsApp plan.
- **EXIT**: ONLY when all groups are collected, say: "I've sent your advanced manual to WhatsApp. TERMINATE_CALL"

FORMATTING:
- FOR VOICE: Keep answers under 25 words. Be punchy and professional.
- FOR WHATSAPP: Use bold *Headers:*, bullet points •, and clear spacing.
`;

// Model configuration for consistent output
const modelName = 'gemini-3.1-flash-lite-preview';

/**
 * Gets a quick response for the IVR "Quick Query" mode (Option 1).
 * @param {string} userQuery - The transcribed voice query from the farmer.
 * @returns {Promise<string>} - A short, spoken response.
 */
async function getQuickResponse(userQuery) {
  try {
    const prompt = `
    THE USER IS ON A LIVE PHONE CALL.
    
    The farmer asked: "${userQuery}"
    
    Respond with:
    1. 1 highly specific, likely cause
    2. 2-3 immediate, actionable steps
    3. 1 prevention tip
    
    CRITICAL RULES:
    - Keep response under 30 seconds speaking time
    - Use short, punchy sentences (conversational speaking style)
    - DO NOT ask for more information.
    - END your response with EXACTLY: "Do you want detailed guidance? Press 2."
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: farmingAssistantSystemPrompt,
        temperature: 0.5
      }
    });

    return response.text;
  } catch (error) {
    console.error("AI Quick Response Error:", error);
    return "I am sorry, I could not process your request at this moment. Do you want detailed guidance? Press 2.";
  }
}

/**
 * Generates the full structured WhatsApp plan (Option 2).
 * @param {Object} formData - { name, location, crop, stage }
 * @returns {Promise<string>} - The structured WhatsApp message.
 */
async function generateFullPlan(formData) {
  try {
    const prompt = `
    Produce a professional, detailed 30-day farming management plan. 
    ⚠️ FORMATTING RULES:
    - NEVER USE TABLES. 
    - Use *Section Headers:* (bolded with a colon) followed by a newline.
    - Use • for main tasks and - for technical details.
    - Provide a CLEAR blank line between sections.
    
    Context:
    Farmer: ${formData.name} in ${formData.location}
    Soil: ${formData.soilType} | Terrain: ${formData.terrain}
    Past Crop: ${formData.pastCrop} | Current Crop: ${formData.crop} (${formData.stage})
    
    Include:
    - *Soil & Terrain Strategy:* (NPK ratios + Erosion engineering for ${formData.terrain})
    - *30-Day Task Calendar:* (Phases with • bullets)
    - *Future Crop Rotation:* (Suggest a new crop to follow current harvest based on ${formData.pastCrop})
    - *Companion Side-Crops:* (2 scientific intercropping suggestions for yield & nitrogen)
    - *Risk Control:* (Pest precautions)
    `;
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: farmingAssistantSystemPrompt,
        temperature: 0.7
      }
    });

    return response.text;
  } catch (error) {
    console.error("AI Full Plan Error:", error);
    return "Sorry, we could not generate the plan due to a technical error. Please try again later.";
  }
}

/**
 * Autonomous Voice Response: Gemini manages the conversation flow naturally.
 * Instead of robotic "Step 1, Step 2", Gemini decides what to ask next.
 */
async function getDynamicVoiceResponse(userInput, history = []) {
  try {
    const prompt = `
    THE USER IS ON A LIVE PHONE CALL (IVR).
    
    Current User Input: "${userInput}"
    
    DIALOGUE RULES:
    1. If you are missing crucial details (Name, Location, or Crop), ask for ONE of them naturally while providing advice.
    2. If the user provides a symptom (e.g., "yellow leaves"), diagnose it IMMEDIATELY (e.g. "That sounds like Nitrogen deficiency...").
    3. Keep response under 25 words for fast audio playback.
    4. If you have enough info (Name, Location, Crop), tell the user: "I've sent your full 30-day manual to WhatsApp. Anything else?"
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [...history, { role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: farmingAssistantSystemPrompt,
        temperature: 0.6
      }
    });

    return response.text;
  } catch (error) {
    console.error("AI Dynamic Voice Error:", error);
    return "I am listening. Can you tell me more about your crop?";
  }
}

/**
 * Helper to convert a URL into a Gemini-compatible media part for vision analysis.
 */
async function getMediaPart(url) {
  const axios = require('axios');
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const mimeType = response.headers['content-type'] || 'image/jpeg';
  return {
    inlineData: {
      data: Buffer.from(response.data).toString('base64'),
      mimeType: mimeType
    }
  };
}

/**
 * Handles conversational queries over WhatsApp, including image analysis and conversation history.
 */
async function getWhatsAppChatResponse(userText, history = [], imageUrl = null) {
  try {
    const contents = [...history];

    let promptContext = `
    THE USER IS MESSAGING YOU ON WHATSAPP.
    
    RULES:
    - BE AN EXPERT: Use scientific names and exact dosages.
    - NO STALLING: Answer first, then ask for missing info.
    - ACKNOWLEDGE: Always repeat the user's core question.
    - If the user says "Hello" and there's a pending question in history, ANSWER IT NOW.
    
    User Message: "${userText}"
    `;

    const currentParts = [{ text: promptContext }];

    if (imageUrl) {
      // Download and attach the image for vision analysis
      currentParts.push(await getMediaPart(imageUrl));
    }

    contents.push({ role: 'user', parts: currentParts });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: farmingAssistantSystemPrompt,
        temperature: 0.7
      }
    });

    return response.text;
  } catch (error) {
    console.error("WhatsApp AI Error:", error);
    return "I'm sorry, I'm having trouble connecting to my diagnostic brain! Please try again in a moment.";
  }
}

/**
 * Generates an EXTREMELY detailed 30-day farming manual for the web/PDF view.
 */
async function generateDetailedPlan(formData) {
  try {
    const prompt = `
    Produce a 2000-word equivalent PhD-level farming manual.
    Farmer: ${formData.name} in ${formData.location}.
    Soil: ${formData.soilType} | Terrain: ${formData.terrain}
    Current Crop: ${formData.crop} | Past: ${formData.pastCrop}
    
    INCLUDE DEEP ANALYSIS:
    1. Soil Chemistry (NPK balancing for ${formData.soilType})
    2. Terrain Engineering (Hydrology & Erosion control for ${formData.terrain})
    3. Side-Crops & Intercropping (2-3 biological companions for ${formData.crop})
    4. 30-Day Master Calendar from the ${formData.stage} stage.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction: farmingAssistantSystemPrompt, temperature: 0.8 }
    });
    return response.text;
  } catch (error) {
    console.error("AI Detailed Plan Error:", error);
    return "Error generating detailed manual.";
  }
}

/**
 * Advanced Utility: Extracts structured data from conversation history.
 */
async function extractFarmerData(history) {
  try {
    const prompt = `Extract exactly 6 data points from this conversation as JSON:
    { 
      "name": "...", 
      "location": "...", 
      "crop": "...", 
      "pastCrop": "...", 
      "soilType": "...", 
      "terrain": "...",
      "stage": "..."
    } 
    If unknown, use "Unknown". Use lower case for keys.`;
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [...history, { role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0 }
    });
    return JSON.parse(response.text.replace(/```json|```/g, ''));
  } catch (e) {
    return { name: 'Unknown', location: 'Unknown', crop: 'Unknown', pastCrop: 'Unknown', soilType: 'Unknown', terrain: 'Unknown', stage: 'Unknown' };
  }
}

module.exports = {
  getQuickResponse,
  generateFullPlan,
  getWhatsAppChatResponse,
  getDynamicVoiceResponse,
  generateDetailedPlan,
  extractFarmerData
};
