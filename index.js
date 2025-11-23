import TelegramBot from "node-telegram-bot-api";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import fs from "fs";
import https from "https";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller);

// Ensure temp folder exists
if (!fs.existsSync("temp")) fs.mkdirSync("temp");

// Init bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// When a voice/audio message arrives → show menu
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

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const replied = query.message.reply_to_message;

  if (!replied || (!replied.voice && !replied.audio)) {
    return bot.sendMessage(chatId, "❗ Please reply to a voice message.");
  }

  const fileId = replied.voice ? replied.voice.file_id : replied.audio.file_id;

  try {
    const fileLink = await bot.getFileLink(fileId);

    // ALWAYS save the file as .ogg
    const inputPath = `temp/input_${Date.now()}.ogg`;
    const outputPath = `temp/output_${Date.now()}.mp3`;

    await downloadFile(fileLink, inputPath);
    await applyEffect(inputPath, outputPath, query.data);

    await bot.sendAudio(chatId, outputPath, {
      reply_to_message_id: replied.message_id,
    });

    safeUnlink(inputPath);
    safeUnlink(outputPath);

    bot.answerCallbackQuery(query.id, { text: "Done ✅" });
  } catch (err) {
    console.error("Processing error:", err);
    bot.sendMessage(chatId, "❌ Failed to process audio.");
    bot.answerCallbackQuery(query.id, { text: "Error" });
  }
});

// Download file safely
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (res.statusCode >= 400) {
          file.close();
          return reject(new Error("Download failed"));
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(destPath);
        });
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => reject(err));
      });
  });
}

// Apply voice effect with FFmpeg
function applyEffect(inputPath, outputPath, effect) {
  return new Promise((resolve, reject) => {
    let filter = "";

    switch (effect) {
      case "male_to_female":
        filter = "asetrate=44100*1.189,aresample=44100,atempo=1.0";
        break;
      case "female_soft":
        filter = "asetrate=44100*1.12,aresample=44100,atempo=1.0,lowpass=f=8000,aecho=0.8:0.9:1000:0.2";
        break;
      case "female_confident":
        filter = "asetrate=44100*1.14,aresample=44100,atempo=1.0,equalizer=f=1000:t=q:w=1:g=3";
        break;
      case "female_young":
        filter = "asetrate=44100*1.3,aresample=44100,atempo=1.05";
        break;
      case "female_mature":
        filter = "asetrate=44100*0.95,aresample=44100,atempo=1.0,lowpass=f=9000,equalizer=f=120:t=q:w=1:g=2";
        break;
      case "female_warm":
        filter = "asetrate=44100*1.08,aresample=44100,atempo=1.0,equalizer=f=120:t=q:w=1:g=3,aecho=0.7:0.9:700:0.15";
        break;
    }

    let ff = ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(44100)
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3");

    if (filter) ff.audioFilters(filter);

    ff.on("start", (cmd) => console.log("FFmpeg start:", cmd))
      .on("error", (err) => {
        console.error("FFmpeg error", err);
        reject(err);
      })
      .on("end", () => {
        console.log("FFmpeg finished:", outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

function safeUnlink(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

// clean shutdown
process.on("SIGINT", () => {
  console.log("Stopping bot...");
  process.exit();
});
