import TelegramBot from "node-telegram-bot-api";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import fs from "fs";
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch"; // required for keep-alive
dotenv.config();

// ------------------------------------------------
// Create temp folder
// ------------------------------------------------
if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
}

// ------------------------------------------------
// FFmpeg Path
// ------------------------------------------------
ffmpeg.setFfmpegPath(ffmpegInstaller);

// ------------------------------------------------
// Telegram Bot Init
// ------------------------------------------------
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.on("message", (msg) => {
    if (msg.voice || msg.audio) {
        sendMenu(msg.chat.id, msg.message_id);
    }
});

// ------------------------------------------------
// Menu UI
// ------------------------------------------------
function sendMenu(chatId, messageId) {
    bot.sendMessage(chatId, "🎧 Choose a voice style:", {
        reply_to_message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔄 Male → Female (Natural)", callback_data: "male_to_female" }],
            ],
        },
    });
}

// ------------------------------------------------
// Callback Handler
// ------------------------------------------------
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const replied = query.message.reply_to_message;

    if (!replied || (!replied.voice && !replied.audio)) {
        return bot.sendMessage(chatId, "❗ Please reply to a voice message.");
    }

    const fileId = replied.voice ? replied.voice.file_id : replied.audio.file_id;

    try {
        const fileLink = await bot.getFileLink(fileId);

        const inputPath = `temp/input_${Date.now()}.ogg`;
        const outputPath = `temp/output_${Date.now()}.ogg`;

        await downloadFile(fileLink, inputPath);

        applyEffect(inputPath, outputPath, query.data, async () => {
            await bot.sendAudio(chatId, outputPath);

            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
        });

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Error processing voice.");
    }
});

// ------------------------------------------------
// DOWNLOAD FILE
// ------------------------------------------------
async function downloadFile(url, path) {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
}

// ------------------------------------------------
// APPLY EFFECT
// ------------------------------------------------
function applyEffect(input, output, effect, callback) {
    let cmd = ffmpeg(input);

    if (effect === "male_to_female") {
        cmd.audioFilters("asetrate=44100*1.30,aresample=44100,atempo=1.00");
    }

    cmd.output(output)
        .on("end", callback)
        .on("error", (err) => console.error("FFmpeg error:", err))
        .run();
}

// ------------------------------------------------
// Render Keep-Alive Ping (Runs every 4 minutes)
// ------------------------------------------------
setInterval(() => {
    fetch("https://YOUR_RENDER_URL.onrender.com")
        .then(() => console.log("🔄 Keep-alive ping sent"))
        .catch(() => {});
}, 240000); // 4 mins

// ------------------------------------------------
– Render Web Server
// ------------------------------------------------
const app = express();
app.get("/", (req, res) => res.send("Bot is running..."));
app.listen(process.env.PORT || 3000, () =>
    console.log("🌐 Web server running")
);

console.log("🤖 Telegram bot is running...");
