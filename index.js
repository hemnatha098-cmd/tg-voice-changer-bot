import TelegramBot from "node-telegram-bot-api";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import fs from "fs";
import https from "https";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller);

// Make temp folder
if (!fs.existsSync("temp")) fs.mkdirSync("temp");

// Init bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Show menu when voice message arrives
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
    return bot.sendMessage(chatId, "❗ Reply to a voice message first.");
  }

  const fileId = replied.voice ? replied.voice.file_id : replied.audio.file_id;

  try {
    const fileLink = await bot.getFileLink(fileId);

    const inputPath = `temp/input_${Date.now()}.ogg`;    // OLD FORMAT
    const outputPath = `temp/output_${Date.now()}.ogg`;  // OLD FORMAT

    await downloadFile(fileLink, inputPath);
    await applyEffect(inputPath, outputPath, query.data);

    await bot.sendAudio(chatId, outputPath, {
      reply_to_message_id: replied.message_id,
    });

    safeUnlink(inputPath);
    safeUnlink(outputPath);

    bot.answerCallbackQuery(query.id, { text: "Done!" });
  } catch (err) {
    console.error("Process error:", err);
    bot.answerCallbackQuery(query.id, { text: "Error" });
    bot.sendMessage(chatId, "❌ Failed to convert voice.");
  }
});

// Download file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (res) => {
      if (res.statusCode >= 400) return reject(new Error("Download failed"));
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(destPath);
      });
    }).on("error", (err) => reject(err));
  });
}

// Apply simple effects
function applyEffect(inputPath, outputPath, effect) {
  return new Promise((resolve, reject) => {
    let filter = "";

    switch (effect) {
      case "male_to_female":
        filter = "asetrate=44100*1.18,aresample=44100,atempo=1";
        break;
      case "female_soft":
        filter = "asetrate=44100*1.12,aresample=44100,aecho=0.8:0.9:1000:0.2";
        break;
      case "female_confident":
        filter = "asetrate=44100*1.14,aresample=44100,equalizer=f=1000:t=q:w=1:g=3";
        break;
      case "female_young":
        filter = "asetrate=44100*1.3,aresample=44100,atempo=1.05";
        break;
      case "female_mature":
        filter = "asetrate=44100*0.95,aresample=44100,lowpass=f=9000";
        break;
      case "female_warm":
        filter = "asetrate=44100*1.08,aresample=44100,aecho=0.7:0.9:700:0.15";
        break;
    }

    let cmd = ffmpeg(inputPath)
      .audioCodec("libopus")          // OLD FORMAT OPUS
      .audioBitrate("64k")            // Telegram standard
      .format("ogg");

    if (filter) cmd.audioFilters(filter);

    cmd.on("start", (cmdLine) => console.log("FFmpeg:", cmdLine))
      .on("error", (err) => reject(err))
      .on("end", () => resolve(outputPath))
      .save(outputPath);
  });
}

function safeUnlink(f) {
  try { fs.unlinkSync(f); } catch (e) {}
}

process.on("SIGINT", () => process.exit());
