import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"
import ffmpeg from "fluent-ffmpeg"
import fs from "fs"
import path from "path"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3001
const ADMIN_ID = 5331869155

// --- НАСТРОЙКА FFmpeg ДЛЯ WINDOWS ---
// Если ты распаковал ffmpeg в другое место, измени путь ниже
const winFfmpegPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const winFfprobePath = 'C:\\ffmpeg\\bin\\ffprobe.exe';

if (fs.existsSync(winFfmpegPath)) {
    ffmpeg.setFfmpegPath(winFfmpegPath);
    ffmpeg.setFfprobePath(winFfprobePath);
    console.log("✅ FFmpeg найден и подключен");
} else {
    console.log("⚠️ FFmpeg.exe не найден по пути C:\\ffmpeg\\bin\\. Кружки могут не работать.");
}

// Server
const app = express()
app.get("/", (req, res) => res.send("Бот работает"))
app.listen(PORT, () => console.log(`🌐 Порт: ${PORT}`))

const bot = new TelegramBot(TOKEN, { polling: false })

// Кэш для хранения ссылок (для callback_data)
const videoCache = new Map()

async function startBot() {
    try {
        await bot.deleteWebHook()
        await bot.startPolling({ interval: 300 })
        console.log("🤖 Бот запущен")
    } catch (e) {
        console.log("❌ Ошибка запуска:", e)
    }
}
startBot()

// Обработка кружка
async function toCircle(videoUrl, output) {
    const tempInput = `temp_in_${Date.now()}.mp4`;
    
    // Скачиваем видео во временный файл
    const res = await axios({ url: videoUrl, responseType: "stream" });
    const writer = fs.createWriteStream(tempInput);
    res.data.pipe(writer);

    await new Promise(r => writer.on("finish", r));

    return new Promise((resolve, reject) => {
        ffmpeg(tempInput)
            .videoFilters([
                "crop='min(iw,ih)':'min(iw,ih)'", // Обрезка в квадрат
                "scale=640:640"                  // Размер для кружка
            ])
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-b:v 1000k',
                '-aspect 1:1'
            ])
            .output(output)
            .on("end", () => {
                if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                resolve();
            })
            .on("error", (err) => {
                if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                reject(err);
            })
            .run();
    });
}

// Меню
const getMenu = (userId) => ({
    reply_markup: {
        keyboard: [
            ["📥 Скачать видео"],
            ["👥 Пригласить", "💖 Поддержать"],
            ...(userId === ADMIN_ID ? [["⚙️ Админ панель"]] : [])
        ],
        resize_keyboard: true
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `👋 Привет! Пришли ссылку на TikTok.`, getMenu(msg.from.id));
});

bot.on("callback_query", async (q) => {
    const chatId = q.message.chat.id;
    if (q.data.startsWith("circle_")) {
        const cacheId = q.data.replace("circle_", "");
        const videoUrl = videoCache.get(cacheId);

        if (!videoUrl) return bot.answerCallbackQuery(q.id, { text: "❌ Ссылка устарела" });

        const status = await bot.sendMessage(chatId, "⏳ Обработка кружка...");
        const output = `circle_${Date.now()}.mp4`;

        try {
            await toCircle(videoUrl, output);
            await bot.sendVideoNote(chatId, output);
            bot.deleteMessage(chatId, status.message_id).catch(() => {});
        } catch (e) {
            console.error(e);
            bot.editMessageText("❌ Ошибка при создании кружка. Проверь FFmpeg.", { chat_id: chatId, message_id: status.message_id });
        } finally {
            if (fs.existsSync(output)) fs.unlinkSync(output);
        }
    }
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith("/")) return;

    const links = text.match(/https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/g);
    if (!links) return;

    for (const link of links) {
        const wait = await bot.sendMessage(chatId, "⏳ Загрузка...");
        try {
            const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`;
            const { data } = await axios.get(api);
            const videoUrl = data?.data?.hdplay || data?.data?.play;

            if (!videoUrl) throw new Error("No video");

            const cacheId = Math.random().toString(36).substring(7);
            videoCache.set(cacheId, videoUrl);

            // Отправляем видео потоком (Stream), чтобы не было ошибок доступа
            const videoStream = await axios({ url: videoUrl, responseType: "stream" });

            await bot.sendVideo(chatId, videoStream.data, {
                caption: `✅ Видео скачано!\n👤 Автор: ${data.data.author.unique_id}`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔘 Сделать кружок", callback_data: `circle_${cacheId}` }],
                        [{ text: "🔗 Прямая ссылка", url: videoUrl }]
                    ]
                }
            });
            bot.deleteMessage(chatId, wait.message_id).catch(() => {});
        } catch (e) {
            bot.editMessageText("❌ Не удалось скачать видео.", { chat_id: chatId, message_id: wait.message_id });
        }
    }
});
