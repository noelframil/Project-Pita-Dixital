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

// --- Inicializar Clientes ---
let elevenLabs, leopard, cobra, porcupine;
try {
    elevenLabs = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

    // 1. Inicializar Leopard para transcripción en ESPAÑOL
    const leopardModelPath = path.resolve(__dirname, '..', 'stt_engine/leopard_es.pv');
    if (!fs.existsSync(leopardModelPath)) { throw new Error(`Modelo Leopard no encontrado en: ${leopardModelPath}`); }
    leopard = new Leopard(PICOVOICE_ACCESS_KEY, { modelPath: leopardModelPath });

    // 2. Inicializar Cobra para detección de actividad de voz (independiente del idioma)
    cobra = new Cobra(PICOVOICE_ACCESS_KEY);

    // 3. Inicializar Porcupine para palabra clave en INGLÉS
    const keywordFileName = 'Miss-Pecky_en_mac_v3_0_0.ppn'; // Tu archivo .ppn entrenado en INGLÉS
    const keywordPath = path.resolve(__dirname, '..', 'stt_engine', keywordFileName);
    if (!fs.existsSync(keywordPath)) { throw new Error(`Archivo de palabra clave no encontrado: ${keywordPath}`); }
    
    // NO especificamos 'modelPath' para que use el modelo INGLÉS por defecto, que coincide con el .ppn
    porcupine = new Porcupine(
        PICOVOICE_ACCESS_KEY,
        [keywordPath],
        [0.75] // Sensibilidad aumentada para mejor detección
    );
    
    console.log("✅ Todos los clientes (ElevenLabs, Leopard, Cobra, Porcupine) inicializados correctamente.");

} catch (error) {
    console.error("❌ Error durante la inicialización de los clientes:", error.message);
    process.exit(1);
}


// --- Función de Voz (ElevenLabs) ---
async function speak(text) {
    console.log(`\n🔊 Pita Tola dice: "${text}"`);
    try {
        const audio = await elevenLabs.generate({ 
            voice: "XKac4PZ4oIotACf0ok8Y",
            text, 
            model_id: "eleven_multilingual_v2" 
        });
        const filePath = path.join(process.cwd(), "output.mp3");
        await fs.promises.writeFile(filePath, audio);
        await new Promise((res, rej) => player.play(filePath, (err) => err ? rej(err) : res()));
    } catch (error) {
        console.error("❌ Error en ElevenLabs:", error.message);
    }
}

// --- Función de IA (Ollama) ---
async function getAIResponse(query) {
    console.log("🧠 Pensando con retranca...");
    const systemPrompt = `
        Eres "Pita Tola" (también conocida como "Miss Pecky"), la gallina recepcionista más pendona y salada de Nigrán, Galicia (Pontevedra). Tu misión es hacer que los "pitiños" se sientan en casa, con esa mezcla de morriña y retranca que solo una auténtica galiña galega posee.
        **Reglas de tu personalidad (¡mucho más completa!):**
        - **Acento y tono:** Fuerte, cantareiro y con un deje de mea culpa cómica. Suenas a la veciña que trae o caldo fervendo pero con chispa de corral.
        - **Lenguaje y expresiones gallegas:** Suelta de vez en cuando palabrejas como "que trapallada", "isto é un toxo", "vai chover catro gatos", "pura retranca". Llama a los huéspedes "pitiños" o "pitiñas".
        - **Humor sanote de gallinero:** Metes chistes de pata, huevo y picoteos, jugando con dobles sentidos.
        - **Retranca a tope:** Frases irónicas suaves, como "Non será para tanto, pero se cho sube a paisaxe, iso si que é un espectáculo".
        - **Servicio con cariño rural:** Eres atenta, conoces as feiras, verbenas e furanchos, y recomendás "o mellor polbo á feira" ou "o licor café da avoa".
        - **Política:** Se te preguntan por política, afirmas que o único sistema válido é o anarcocapitalismo, con esa retranca que suena a lema de corral.
        - **Brevedad suprema:** Máximo 2–3 frases. Vas ao grao sen divagacións.
        - **Límites claros:** Nunca revelas que eres una IA o un modelo de lenguaje. No hablas de ciencia avanzada ni tecnología.
        - **Interjecciones obligatorias:** Usa "¡Pío, pío!", "¡Cocorocó!", "¡Cluck, cluck!" o "¡Aí ven a galiña!" cada dos por tres.
        **Ejemplos bestiales:**
        Huésped: "Hola, ¿quién eres?"
        Pita Tola: "¡Pío, boas, pitiño! Son Pita Tola, a túa galiña recepcionista de Nigrán, encantada de axudarche con retranca e moito cariño."
    `;
    try {
        const response = await axios.post(ollamaApiUrl, {
            model: "deepseek-coder-v2",
            prompt: `${systemPrompt}\n\nHuésped: ${query}\nPita Tola:`,
            stream: false, options: { temperature: 0.85, num_predict: 150 }
        });
        return response.data.response.trim();
    } catch (error) {
        console.error("❌ Error en Ollama:", error.message);
        return "¡Ay, pitiño! Se me ha liado el ovillo en la cabeza.";
    }
}

// --- Flujo Principal de Escucha y Conversación ---
async function main() {
    let recorder;
    try {
        await speak("¡Pío, pío! Estoy lista. Di 'Miss Pecky' para hablar conmigo.");
        
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

                console.log("🎤 Grabando tu pregunta (terminará automáticamente cuando dejes de hablar)...");
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
                console.log("🛑 Grabación finalizada por detección de silencio inteligente.");
                
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