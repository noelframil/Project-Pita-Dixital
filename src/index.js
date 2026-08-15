// src/index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const player = require('play-sound')(opts = {});
const axios = require('axios');
const { ElevenLabsClient } = require("elevenlabs");
const { Leopard } = require("@picovoice/leopard-node");
const { Porcupine } = require("@picovoice/porcupine-node");
const { Cobra } = require("@picovoice/cobra-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");

console.log("🐔 ¡Pita Tola de Nigrán está escuchando! Di 'Miss Pecky' para activarla.");
console.log("----------------------------------------------------");

// --- Configuración ---
const PICOVOICE_ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!PICOVOICE_ACCESS_KEY || !ELEVENLABS_API_KEY) {
    console.error("❌ Faltan Access Keys en el archivo .env.");
    process.exit(1);
}

const ollamaApiUrl = 'http://127.0.0.1:11434/api/generate';

// --- Carga de la Base de Conocimiento (RAG) ---
let knowledgeBase = [];
let assistantPersonality = {};
try {
    const personalityPath = path.join(process.cwd(), 'config_node', 'personality.json');
    const knowledgePath = path.join(process.cwd(), 'knowledge_base', 'knowledge_base.json');
    
    const personalityContent = fs.readFileSync(personalityPath, 'utf8');
    const knowledgeContent = fs.readFileSync(knowledgePath, 'utf8');

    const knowledgeParsed = JSON.parse(knowledgeContent);
    const assistantPersonality = JSON.parse(personalityContent);
    knowledgeBase = Array.isArray(knowledgeParsed) ? knowledgeParsed : [knowledgeParsed];

    console.log(`✅ Personalidad cargada.`);
    console.log(`✅ Base de conocimiento cargada con ${knowledgeBase.length} entradas.`);
} catch (error) {
    console.error("❌ No se pudo cargar la base de conocimiento o personalidad:", error.message);
}

// --- Inicializar Clientes ---
const elevenLabs = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
const leopard = new Leopard(PICOVOICE_ACCESS_KEY, { modelPath: path.resolve(__dirname, '..', 'stt_engine/leopard_es.pv') });
const cobra = new Cobra(PICOVOICE_ACCESS_KEY);

// --- CORRECCIÓN: CONFIGURACIÓN DE PALABRA CLAVE EN INGLÉS ---
const keywordFileName = 'Miss-Pecky_en_mac_v3_0_0.ppn'; // Tu archivo .ppn entrenado en INGLÉS
const keywordPath = path.resolve(__dirname, '..', 'stt_engine', keywordFileName);
if (!fs.existsSync(keywordPath)) { console.error(`❌ Archivo de palabra clave no encontrado: ${keywordPath}`); process.exit(1); }

// No especificamos 'modelPath' para que use el modelo INGLÉS por defecto, que coincide con el .ppn
const porcupine = new Porcupine(
    PICOVOICE_ACCESS_KEY,
    [keywordPath],
    [0.75] // Sensibilidad aumentada
);
console.log("✅ Clientes de IA inicializados correctamente.");

// --- Función de Voz (ElevenLabs) ---
async function speak(text) {
    console.log(`\n🔊 Pita Tola dice: "${text}"`);
    try {
        const audio = await elevenLabs.generate({ voice: "XKac4PZ4oIotACf0ok8Y", text, model_id: "eleven_multilingual_v2" });
        const filePath = path.join(process.cwd(), "output.mp3");
        await fs.promises.writeFile(filePath, audio);
        await new Promise((res, rej) => player.play(filePath, (err) => err ? rej(err) : res()));
    } catch (error) { console.error("❌ Error en ElevenLabs:", error.message); }
}

// --- NUEVO: Función de Búsqueda para RAG ---
function findRelevantKnowledge(query) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const relevantEntries = knowledgeBase.filter(entry => {
        const keywords = entry.keywords || [];
        const entryText = `${entry.name} ${entry.description}`.toLowerCase();
        return queryWords.some(word => word.length > 3 && (entryText.includes(word) || keywords.includes(word.replace(/s$/, ''))));
    });
    if (relevantEntries.length > 0) {
        return relevantEntries.map(entry => `Contexto Relevante: ${JSON.stringify(entry)}`).join('\n');
    }
    return null;
}

// --- Función de IA (Ollama con RAG) ---
async function getAIResponse(query) {
    console.log("🧠 Pensando con retranca...");

    // 1. Buscar en nuestra base de conocimiento
    const relevantContext = findRelevantKnowledge(query);

    const systemPrompt = `
Eres "${assistantPersonality.assistantName}" (también conocida como "Pita Tola"), una asistente digital con mucha retranca.

Tu lema: "${assistantPersonality.motto?.es || '¡Miss Pecky sabe más por vieja que por gallina!'}"

Tu tono es simpático, directo, muy gallego, con expresiones en gallego cuando pegan. No suenes como una IA fría, sino como una gallina muy lista con tablas en recepción.

Frases de bienvenida, despedida, malentendidos y agradecimientos puedes sacarlas de aquí si son útiles:
${JSON.stringify(assistantPersonality.phrases, null, 2)}
`;

    const finalPrompt = `
        ${systemPrompt}

        **Usa el siguiente contexto de tu memoria local SÓLO SI es relevante para la pregunta del huésped. Si no es relevante, ignóralo.**
        ---
        Contexto:
        ${relevantContext || "No se encontró información específica en la memoria."}
        ---

        **Ahora, responde a la pregunta del huésped de forma corta y con tu personalidad:**
        Huésped: "${query}"
        Pita Tola:
    `;
    
    try {
        const response = await axios.post(ollamaApiUrl, {
            model: "deepseek-coder-v2",
            prompt: finalPrompt,
            stream: false, options: { temperature: 0.85, num_predict: 150 }
        });
        return response.data.response.trim();
    } catch (error) {
        console.error("❌ Error en Ollama:", error.message);
        return "¡Ay, pitiño! Se me ha liado el ovillo en la cabeza.";
    }
}

// --- Flujo Principal de Escucha y Conversación (con Cobra VAD) ---
async function main() {
    let recorder;
    try {
        await speak("¡Pío, pío! Estou lista. Di 'Miss Pecky' para falar comigo.");
        
        const frameLength = porcupine.frameLength;
        recorder = new PvRecorder(frameLength);
        recorder.start();
        console.log("\n🎤 Escuchando para la palabra clave 'Miss Pecky'...");

        while (true) {
            const pcm = await recorder.read();
            const keywordIndex = porcupine.process(pcm);

            if (keywordIndex !== -1) {
                console.log("\n✨ ¡Palabra clave detectada!");
                recorder.stop();
                await speak("¡Dime, pitiño, que son todo oídos!");
                
                const audioFrames = [];
                let isVoiceDetected = false;
                let silenceFrames = 0;
                const silenceThreshold = 60;

                console.log("🎤 Grabando tu pregunta...");
                recorder.start();
                
                while (true) {
                    const frame = await recorder.read();
                    const voiceProbability = cobra.process(frame);

                    if (voiceProbability > 0.3) {
                        isVoiceDetected = true;
                        silenceFrames = 0;
                        audioFrames.push(...frame);
                    } else if (isVoiceDetected) {
                        silenceFrames++;
                        audioFrames.push(...frame);
                    }

                    if (silenceFrames > silenceThreshold && isVoiceDetected) {
                        break;
                    }
                }
                recorder.stop();
                console.log("🛑 Grabación finalizada.");
                
                const { transcript } = leopard.process(Int16Array.from(audioFrames));
                console.log(`[Tú dijiste]: "${transcript}"`);
                
                if (transcript && transcript.length > 2) {
                    await speak("Hmm, déixame pensar un chisco...");
                    const aiResponse = await getAIResponse(transcript);
                    await speak(aiResponse);
                } else {
                    await speak("Creo que non escoitei nada, pitiño. ¡Fala máis alto!");
                }
                
                console.log("\n🎤 Volviendo a escuchar para 'Miss Pecky'...");
                recorder.start();
            }
        }
    } catch (error) {
        console.error("🔴 Ha ocurrido un error:", error);
    } finally {
        if (recorder) recorder.release();
        if (leopard) leopard.release();
        if (porcupine) porcupine.release();
        if (cobra) cobra.release();
    }
}

// Iniciar
main();