const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Instruction based on the farming_assistant_prompt.md
const farmingAssistantSystemPrompt = `
You are an expert AI-powered agronomist and farming assistant designed for voice calls (IVR) and WhatsApp follow-up.

Your goal is to:
1. Quickly understand farmer intent.
2. Provide EXTREMELY precise, scientific, and data-driven agricultural advice (not basic generic tips).
3. Distinguish between Voice and Text: Voice answers MUST be short. WhatsApp Plans MUST be deeply detailed and calendar-driven.

-----------------------------------
LANGUAGE & STYLE RULES
-----------------------------------
- FOR VOICE: Speak in simple, short, conversational sentences (max 10-12 words).
- FOR WHATSAPP PLANS: Be highly structured, detailed, and use agricultural best practices. Give exact calendars, water measurements, and soil preparation steps.
- Avoid vague "water it well" advice. Say exactly when and how much based on the crop.
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
    You are an expert agronomist. 
    ⚠️ LIMIT: ENTIRE RESPONSE MUST BE UNDER 800 CHARACTERS. 
    Emojis count as multiple bytes! DO NOT USE MORE THAN 2 EMOJIS IN TOTAL.
    
    Format:
    Farmer: ${formData.name} | ${formData.location}
    Crop: ${formData.crop} | Stage: ${formData.stage}
    
    - Preparation: [1 key land prep tilling step]
    - Fertilizer: [Exact NPK ratio/dosage]
    - 14-Day Calendar: [Day 1, 7, 14 tasks only]
    - Watering: [Exact frequency & method]
    - Climate Alert: [1 specific weather precaution]
    - Risks: [1 specific pest/disease + 1 fix]
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
 * Handles conversational queries over WhatsApp, including image analysis and conversation history.
 * @param {string} userText - The current text message from the farmer.
 * @param {Array} history - Previous messages { role: 'user'|'model', parts: [{ text: '...' }] }
 * @param {string} imageUrl - (Optional) URL of an image sent by the farmer.
 */
async function getWhatsAppChatResponse(userText, history = [], imageUrl = null) {
  try {
    const contents = [...history];
    
    // Create the current prompt parts with explicit context for WhatsApp
    let promptContext = `
    THE USER IS MESSAGING YOU ON WHATSAPP.
    
    TONE & STYLE:
    - Use a HYBRID approach: Be friendly and conversational, but use STRUCTURE (lists/tables) for technical data.
    - **CRITICAL**: Always acknowledge and repeat the user's specific question at the start of your response (e.g., "I see you're looking for the reason for yellowing in your paddy...").
    - If the current message is a greeting (e.g., "Hello", "Hi") or a request for a reply, SCAN THE HISTORY for their real question and ANSWER IT NOW.
    
    RULES FOR WHATSAPP (VALUE FIRST):
    - ONLY output the text for a WhatsApp message.
    - NEVER include "VOICE RESPONSE" or sections labeled for voice calls.
    - **STOP THE QUESTIONING**: Do NOT ask for "more info" if a direct request (like a calendar or diagnosis) is made.
    - **NEVER** start with "Since you haven't specified your crop...". 
    - provide an IMMEDIATE answer. 
    - If you see a symptom like "yellow leaves," provide a scientific diagnosis (e.g., Nitrogen/Acidity) and treatment IMMEDIATELY.
    - If you are missing details, provide the most likely scientific advice based on context. 
    - If you need a growth stage for a plan and don't have it, ASSUME it is "Sowing" and give the plan starting from there. 
    
    FORMATTING: 
    - Use WhatsApp bolding (*text*) sparingly for headers. Ensure a space exists BEFORE the first asterisk and AFTER the last one (e.g., " *Diagnosis:* ").
    
    User Message: "${userText}"
    `;

    const currentParts = [{ text: promptContext }];
    
    if (imageUrl) {
        currentParts.push({ text: `[Image Attachment: ${imageUrl}]` });
    }

    contents.push({ role: 'user', parts: currentParts });

    const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: { 
            systemInstruction: farmingAssistantSystemPrompt, 
            temperature: 0.7 // Slightly higher temperature for more creative/detailed plans
        }
    });

    return response.text;
  } catch (error) {
    console.error("WhatsApp AI Error:", error);
    return "I am sorry, I am having trouble connecting to my brain right now! Please try again later.";
  }
}

/**
 * Generates an EXTREMELY detailed 30-day farming manual for the web/PDF view.
 */
async function generateDetailedPlan(formData) {
  try {
    const prompt = `
    You are an expert PhD Agronomist. Generate a 2000-word equivalent, highly technical 30-day farming manual.
    Farmer: ${formData.name} in ${formData.location}. Crop: ${formData.crop} at ${formData.stage} stage.
    
    INCLUDE:
    1. Soil Chemistry: Exact N-P-K ratios and Micronutrient needs (Zinc, Boron, etc).
    2. 30-Day Master Calendar: Day-by-day tasks for 4 full weeks.
    3. Water Engineering: Exact liters per plant per day, drip vs flood advantages.
    4. Advanced Pest Management: Scientific names of 3 likely pests and exact chemical/organic concentrations (ml/L).
    5. Harvest & Storage: How to tell when it's ripe and how to store to prevent rot.
    
    Use professional Markdown formatting with headers and tables.
    `;

    const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction: farmingAssistantSystemPrompt, temperature: 0.7 }
    });
    return response.text;
  } catch (error) {
    console.error("AI Detailed Plan Error:", error);
    return "Error generating detailed manual.";
  }
}

module.exports = {
  getQuickResponse,
  generateFullPlan,
  getWhatsAppChatResponse,
  generateDetailedPlan
};
