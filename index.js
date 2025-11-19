import TelegramBot from "node-telegram-bot-api";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import fs from "fs";
import express from "express";
import dotenv from "dotenv";
dotenv.config();

// ------------------------------------------------
// Create temp folder (Render compatible)
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

                [{ text: "Soft Woman", callback_data: "female_soft2" }],
                [{ text: "Confident Woman", callback_data: "female_confident" }],
                [{ text: "Young Girl", callback_data: "female_young" }],
                [{ text: "Mature Woman", callback_data: "female_mature2" }],
                [{ text: "Warm Lady", callback_data: "female_warm2" }],
            ],
        },
    });
}

// ------------------------------------------------
// Callback Query Handler
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
