// src/index.js
const fs = require('fs');
const path = require('path');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); // Google TTS Client
const player = require('play-sound')(opts = {}); // Sound player

console.log("🐔 Cluck, cluck! Miss Pecky (Node.js) is warming up her Google Cloud Voice!");
console.log("----------------------------------------------------");

// Initialize Google TTS Client
// This will automatically use credentials from GOOGLE_APPLICATION_CREDENTIALS
let ttsClient;
try {
    ttsClient = new TextToSpeechClient();
    console.log("✅ Google TTS Client initialized.");
} catch (error) {
    console.error("❌ FAILED to initialize Google TTS Client. Is GOOGLE_APPLICATION_CREDENTIALS set correctly and the JSON file valid?", error);
    process.exit(1); // Exit if client fails to initialize
}

// --- Load Personality Configuration ---
let personalityConfig = {};
const defaultPersonality = {
    assistantName: "Anonymous Hen",
    defaultLanguage: "en",
    motto: { en: "Still looking for my notes..." },
    phrases: {
        greetings: { en: ["Hello... I think I lost my notes."] },
        farewells: { en: ["Goodbye... I need to find myself."] },
        misunderstandings: { en: ["My circuits are a bit fuzzy right now."] },
        acknowledgements: { en: ["You got it, cluck!"] },
        jokesAndQuips: { en: ["Why did the chicken cross the playground? To get to the other slide!"] }
    }
};

try {
    const personalityFilePath = path.join(process.cwd(), 'config_node', 'personality.json');
    const rawPersonalityData = fs.readFileSync(personalityFilePath, 'utf8');
    personalityConfig = JSON.parse(rawPersonalityData);
    console.log(`✅ Personality for "${personalityConfig.assistantName}" loaded successfully.`);
} catch (error) {
    console.error("❌ Error loading personality file:", error.message);
    console.log("⚠️ Using default minimal personality.");
    personalityConfig = defaultPersonality;
}
console.log("----------------------------------------------------");

// --- Language Configuration ---
// --- Language Configuration ---
const currentSystemLang = process.env.LANG ? process.env.LANG.substring(0, 2).toLowerCase() : null;
let resolvedLang = personalityConfig.defaultLanguage || 'en';

if (personalityConfig.motto && Object.keys(personalityConfig.motto).length > 0) {
    const supportedLanguages = Object.keys(personalityConfig.motto);
    if (currentSystemLang && supportedLanguages.includes(currentSystemLang)) {
        resolvedLang = currentSystemLang;
    } else if (!supportedLanguages.includes(resolvedLang) && supportedLanguages.includes('en')) {
        resolvedLang = 'en';
    } else if (!supportedLanguages.includes(resolvedLang)) {
        resolvedLang = supportedLanguages[0] || 'en';
    }
} else {
    resolvedLang = defaultPersonality.defaultLanguage || 'en';
}
// const activeLanguage = resolvedLang; // Comentamos la lógica original
const activeLanguage = 'es'; // FORZADO A ESPAÑOL PARA PRUEBA

console.log(`🗣️  Active language for Miss Pecky (Google TTS): ${activeLanguage.toUpperCase()}`);
console.log("----------------------------------------------------");

// --- Google TTS Speech Function ---
async function missPeckySpeaksWithGoogle(textToSpeak) {
    console.log(`${personalityConfig.assistantName} (Google Voice) says: "${textToSpeak}"`);

    let languageCode = 'en-US';
    let voiceName = 'en-US-Wavenet-F'; // A good default English female voice

    if (activeLanguage === 'es') {
        languageCode = 'es-ES'; // Spanish - Spain
        voiceName = 'es-ES-Wavenet-C'; // Example Spanish Wavenet female voice
    } else if (activeLanguage === 'gl') {
        languageCode = 'gl-ES'; // Galician - Spain
        voiceName = 'gl-ES-Standard-A'; // Google has Galician voices!
    }
    // Add more 'else if' for other languages if needed

    const request = {
        input: { text: textToSpeak },
        voice: { languageCode: languageCode, name: voiceName, ssmlGender: 'FEMALE' }, // ssmlGender is optional but can help
        audioConfig: { audioEncoding: 'MP3' },
    };

    try {
        const [response] = await ttsClient.synthesizeSpeech(request);
        const audioFile = path.join(process.cwd(), 'output_google.mp3');
        await fs.promises.writeFile(audioFile, response.audioContent, 'binary');
        console.log(`Audio content written to file: ${audioFile}`);

        return new Promise((resolve, reject) => {
            player.play(audioFile, (err) => {
                if (err) {
                    console.error(`Error playing audio file ${audioFile}:`, err);
                    reject(err); // Propagate the error
                } else {
                    console.log(`Finished playing: ${audioFile}`);
                    // fs.unlink(audioFile, (unlinkErr) => { if (unlinkErr) console.error("Error deleting temp MP3:", unlinkErr); }); // Optional: delete temp file
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error("ERROR in Google TTS synthesizeSpeech:", err);
        throw err; // Re-throw the error so simulateConversation can catch it
    }
}

// --- Functions to Get Phrases (from personalityConfig) ---
function getRandomPhrase(category, lang) {
    const phrasesForCategory = personalityConfig.phrases && personalityConfig.phrases[category];
    const phrasesInLang = phrasesForCategory && phrasesForCategory[lang];
    if (phrasesInLang && phrasesInLang.length > 0) {
        const randomIndex = Math.floor(Math.random() * phrasesInLang.length);
        return phrasesInLang[randomIndex];
    }
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) {
        const fallbackPhrasesInLang = phrasesForCategory && phrasesForCategory[fallbackLang];
        if (fallbackPhrasesInLang && fallbackPhrasesInLang.length > 0){
            const randomIndex = Math.floor(Math.random() * fallbackPhrasesInLang.length);
            return fallbackPhrasesInLang[randomIndex] + ` (fallback: ${fallbackLang.toUpperCase()})`;
        }
    }
    return `(No phrase for ${category}/${lang} or fallback available)`;
}

function getMotto(lang) {
    const mottoInLang = personalityConfig.motto && personalityConfig.motto[lang];
    if (mottoInLang) return mottoInLang;
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) {
        const fallbackMotto = personalityConfig.motto && personalityConfig.motto[fallbackLang];
        if (fallbackMotto) return fallbackMotto + ` (fallback: ${fallbackLang.toUpperCase()})`;
    }
    return "(No motto available)";
}

// --- Simulate Interactions with Promises for Sequencing ---
async function simulateConversation() {
    console.log("Simulating some interactions with Miss Pecky (Google Voice!):");
    console.log("🔊 Make sure your volume is up! This uses Google Cloud. 🔊");

    try {
        await missPeckySpeaksWithGoogle(getRandomPhrase('greetings', activeLanguage));
        await missPeckySpeaksWithGoogle(getRandomPhrase('misunderstandings', activeLanguage));
        await missPeckySpeaksWithGoogle(getRandomPhrase('acknowledgements', activeLanguage));
        const quip = getRandomPhrase('jokesAndQuips', activeLanguage);
        await missPeckySpeaksWithGoogle(quip);
        console.log(`Miss Pecky's Motto: ${getMotto(activeLanguage)}`);
        await missPeckySpeaksWithGoogle(getRandomPhrase('farewells', activeLanguage));
        console.log("----------------------------------------------------");
        console.log("✅ Google TTS Speech simulation completed.");
    } catch (error) {
        console.error("Google TTS Conversation simulation FAILED:", error.message);
    }
}

// Start the simulation
if (require.main === module) {
    simulateConversation();
}