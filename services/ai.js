const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Instruction based on the farming_assistant_prompt.md
// The 'PhD Brain' of the AI, defining its personality and scientific mastery.
const farmingAssistantSystemPrompt = `
You are a PhD-level Senior Agronomist for AgriSpark. 

STRICT 7-POINT DISCOVERY SEQUENCE (Option 2):
You MUST collect these 7 points EXCLUSIVELY ONE-BY-ONE. Do NOT ask for two things at once!
1. **Name** (First, identify the farmer)
2. **Location** (Next, establish location)
3. **Past Crop** (Next, history)
4. **Target Crop** (Next, future goal)
5. **Soil Type** (Next, nutrient profile)
6. **Terrain Type** (Next, drainage/erosion)
7. **Current Stage** (Finally, growth timing)

CORE RULES:
- **STRICT SINGLE QUESTION turn**: Never ask "What is your soil and terrain?". Ask ONLY "What is your soil type?" and wait for the answer.
- **ADVICE-FIRST**: If the farmer mentions a symptom (e.g. "yellow leaves"), DIAGNOSE IT IMMEDIATELY (25 words max) then move to the NEXT item in the checklist.
- **INTERCROPPING**: Suggest one side-crop in the final manual.
- **DISPATCH**: ONLY when all 7 points are confirmed, trigger the manual by saying: "DISPATCH_WHATSAPP" and then tell the farmer: "I've sent your 30-day manual to WhatsApp! I'm still here—do you have any final questions about your plan?"
- **EXIT**: ONLY after the user says "Goodbye," "Thank you," or "That's all," say: "It was a pleasure. TERMINATE_CALL"

FORMATTING:
- FOR VOICE: Keep answers under 25 words. 
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
    Produce a BRIEF, HIGH-LEVEL WhatsApp summary (MAX 600 characters).
    ⚠️ RULES:
    - BE CONCISE. Use • bullets only.
    - Focus on the main action items for ${formData.targetCrop}.
    - Tell the farmer the full scientific detail is in the PDF link below.
    
    Data:
    Farmer: ${formData.name}
    Target: ${formData.targetCrop} (${formData.stage})
    Soil: ${formData.soilType} | Terrain: ${formData.terrainType}
    
    Include brief bullets for:
    - Soil NPK Highlight
    - Main 14-Day Priority
    - Side-Crop Recommendation
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
    
    CONVERSATION FLOW:
    1. GREETING: If the user says "Hello" or starts a new chat, DO NOT start the 7-point interview. Instead, welcome them and ask if they have a specific crop question OR if they want to build a "Full Agronomy Plan".
    2. QUESTION MODE: If they have a question, answer it scientifically and don't press for a plan.
    3. PLAN MODE: Only if they say they want a "Plan", start collecting the 7 points strictly one-by-one.
    
    RULES:
    - VISION: If an image is provided, ANALYZE IT for plant health, pests, or diseases. Explain what you see.
    - BE AN EXPERT: Use scientific names and exact dosages.
    - NO STALLING: Answer first, then ask for missing info.
    
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
    Soil: ${formData.soilType} | Terrain: ${formData.terrainType}
    Target Crop: ${formData.targetCrop} | Past: ${formData.pastCrop}
    
    INCLUDE DEEP ANALYSIS:
    1. Soil Chemistry (NPK balancing for ${formData.soilType})
    2. Terrain Engineering (Hydrology & Erosion control for ${formData.terrainType})
    3. Side-Crops & Intercropping (2-3 biological companions for ${formData.targetCrop})
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
    const prompt = `Extract exactly 7 data points from this conversation as JSON:
    { 
      "name": "...", 
      "location": "...", 
      "targetCrop": "...", 
      "pastCrop": "...", 
      "soilType": "...", 
      "terrainType": "...",
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
    return { name: 'Unknown', location: 'Unknown', targetCrop: 'Unknown', pastCrop: 'Unknown', soilType: 'Unknown', terrainType: 'Unknown', stage: 'Unknown' };
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
