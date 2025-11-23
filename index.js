import TelegramBot from "node-telegram-bot-api";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller);

// Ensure temp folder
const TEMP_DIR = "temp";
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// Init bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// When a message with voice/audio arrives, show menu
bot.on("message", (msg) => {
  if (msg.voice || msg.audio) {
    sendMenu(msg.chat.id, msg.message_id);
  }
});

function sendMenu(chatId, messageId) {
  bot.sendMessage(chatId, "🎧 Choose a voice style:", {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔄 Male → Female (Natural)", callback_data: "male_to_female" }],
        [{ text: "Soft Woman", callback_data: "female_soft" }],
        [{ text: "Confident Woman", callback_data: "female_confident" }],
        [{ text: "Young Girl", callback_data: "female_young" }],
        [{ text: "Mature Woman", callback_data: "female_mature" }],
        [{ text: "Warm Lady", callback_data: "female_warm" }],
      ],
    },
  });
}

// Callback handler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const replied = query.message.reply_to_message;

  if (!replied || (!replied.voice && !replied.audio)) {
    return bot.sendMessage(chatId, "❗ Please reply to a voice message.");
  }

  const fileId = replied.voice ? replied.voice.file_id : replied.audio.file_id;

  try {
    const fileLink = await bot.getFileLink(fileId);

    const inputPath = path.join(TEMP_DIR, `input_${Date.now()}`);
    const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.mp3`); // user chose MP3

    await downloadFile(fileLink, inputPath);
    await applyEffect(inputPath, outputPath, query.data);

    // send audio back
    await bot.sendAudio(chatId, outputPath, { reply_to_message_id: replied.message_id });

    // cleanup
    safeUnlink(inputPath);
    safeUnlink(outputPath);

    // answer callback (dismiss loading)
    bot.answerCallbackQuery(query.id, { text: "Done ✅" });
  } catch (err) {
    console.error("Processing error:", err);
    bot.sendMessage(chatId, "❌ Failed to process audio. Try again.");
    bot.answerCallbackQuery(query.id, { text: "Failed" });
  }
});

// Download file (supports http/https)
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // keep extension if present on URL
    const ext = path.extname(new URL(url).pathname) || "";
    const outPath = destPath + (ext || ".tmp");
    const file = fs.createWriteStream(outPath);

    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        safeUnlink(outPath);
        return reject(new Error("Failed to download file, status " + res.statusCode));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(outPath);
      });
    }).on("error", (err) => {
      file.close();
      safeUnlink(outPath);
      reject(err);
    });
  });
}

// Apply effect and export MP3 (AAC alternatives could be used — user requested MP3)
function applyEffect(inputPath, outputPath, effectName) {
  return new Promise((resolve, reject) => {
    // default ffmpeg command
    // We'll map effectName -> a chain of filters
    // Explanation (brief):
    // - male_to_female: pitch up (asetrate trick) + slight tempo compensation
    // - female_soft: slight pitch up + gentle lowpass + reverb (aecho)
    // - female_confident: moderate pitch up + boost mid frequencies
    // - female_young: higher pitch up + faster tempo
    // - female_mature: lower pitch (mild) + warmth (bass)
    // - female_warm: mild pitch up + bass boost + reverb

    // We'll try to be robust to different input sample rates by resampling to 44100
    const ff = ffmpeg(inputPath).audioChannels(1).audioFrequency(44100);

    // apply filters
    let afilter = "";

    switch (effectName) {
      case "male_to_female":
        // pitch up ~ +3 semitones: approx rate * 1.189
        // use asetrate then aresample to keep playback speed natural
        afilter = "asetrate=44100*1.189,aresample=44100,atempo=1.0";
        break;

      case "female_soft":
        // gentle pitch up + lowpass + reverb
        afilter = "asetrate=44100*1.12,aresample=44100,atempo=1.0, lowpass=f=8000, aecho=0.8:0.9:1000:0.2";
        break;

      case "female_confident":
        // pitch up + EQ mid boost
        // use equalizer filter to boost ~1kHz
        afilter = "asetrate=44100*1.14,aresample=44100,atempo=1.0, equalizer=f=1000:t=q:w=1:g=3";
        break;

      case "female_young":
        // higher pitch up + slightly faster
        afilter = "asetrate=44100*1.3,aresample=44100,atempo=1.05";
        break;

      case "female_mature":
        // slight pitch down and warm bass boost
        afilter = "asetrate=44100*0.95,aresample=44100,atempo=1.0, lowpass=f=9000, equalizer=f=120:t=q:w=1:g=2";
        break;

      case "female_warm":
        // mild pitch up + bass boost + reverb
        afilter = "asetrate=44100*1.08,aresample=44100,atempo=1.0, equalizer=f=120:t=q:w=1:g=3, aecho=0.7:0.9:700:0.15";
        break;

      default:
        afilter = ""; // passthrough
    }

    if (afilter) ff.audioFilters(afilter);

    // set mp3 encoder
    // bitrate 128k is a good default for voice
    ff
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("start", (cmd) => {
        console.log("FFmpeg start:", cmd);
      })
      .on("error", (err, stdout, stderr) => {
        console.error("FFmpeg error", err.message);
        // try fallback: convert without filters to ensure we still return something
        // fallback only if filters were used
        if (afilter) {
          console.log("Attempting fallback (no filters)...");
          ffmpeg(inputPath)
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .format("mp3")
            .save(outputPath)
            .on("end", () => resolve(outputPath))
            .on("error", (e) => reject(e));
        } else {
          reject(err);
        }
      })
      .on("end", () => {
        console.log("FFmpeg finished ->", outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    // ignore
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Exiting...");
  process.exit();
});
