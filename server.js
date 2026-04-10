import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import express from "express";
import dotenv from "dotenv";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

dotenv.config();

const TOKEN = process.env.TOKEN;
const PORT = process.env.PORT || 3001;
const BOT_USERNAME = "AZASAVED_bot";
const ADMIN_ID = 5331869155;

if (!TOKEN) {
    console.log("❌ TOKEN missing");
    process.exit(1);
}

// Сервер для поддержания жизни процесса
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => console.log(`🌐 Server started on ${PORT}`));

const bot = new TelegramBot(TOKEN, { polling: false });

// Кэш для ссылок (чтобы не превышать лимит 64 байта в callback_data)
const videoCache = new Map();

async function startBot() {
    try {
        await bot.deleteWebHook();
        await bot.startPolling({ interval: 300 });
        console.log("🤖 Bot started");
    } catch (e) {
        console.log("❌ Bot start error:", e);
    }
}

startBot();

// Хранилище данных (в продакшне лучше использовать БД)
const users = new Set();
const bannedUsers = new Set();
const adminState = {};
let totalDownloads = 0;
let totalRequests = 0;

// Очистка сообщений
const lastMessages = new Map();
function track(chatId, msg) {
    if (!lastMessages.has(chatId)) lastMessages.set(chatId, []);
    lastMessages.get(chatId).push(msg.message_id);
}

async function clearChat(chatId) {
    if (!lastMessages.has(chatId)) return;
    for (const id of lastMessages.get(chatId)) {
        await bot.deleteMessage(chatId, id).catch(() => {});
    }
    lastMessages.set(chatId, []);
}

// Создание кружка
async function toCircle(videoUrl, output) {
    const input = `input_${Date.now()}.mp4`;
    const response = await axios({ url: videoUrl, responseType: "stream" });
    const writer = fs.createWriteStream(input);
    response.data.pipe(writer);

    await new Promise((resolve) => writer.on("finish", resolve));

    return new Promise((resolve, reject) => {
        ffmpeg(input)
            .videoFilters([
                "crop='min(iw,ih)':'min(iw,ih)'", // Делаем квадрат
                "scale=640:640"                  // Масштабируем под стандарт Telegram
            ])
            .output(output)
            .on("end", () => {
                if (fs.existsSync(input)) fs.unlinkSync(input);
                resolve();
            })
            .on("error", (err) => {
                if (fs.existsSync(input)) fs.unlinkSync(input);
                reject(err);
            })
            .run();
    });
}

function mainMenu(chatId, userId) {
    return bot.sendMessage(chatId, "📌 Главное меню", {
        reply_markup: {
            keyboard: [
                ["📥 Скачать видео"],
                ["👥 Пригласить", "💖 Поддержать"],
                ...(userId === ADMIN_ID ? [["⚙️ Админ панель"]] : [])
            ],
            resize_keyboard: true
        }
    });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    users.add(msg.from.id);
    bot.sendMessage(chatId, `👋 Привет!\n\n🎬 Я скачиваю видео из TikTok без водяного знака.\n\n📎 Отправь ссылку — и я скачаю 🚀`);
    mainMenu(chatId, msg.from.id);
});

bot.on("callback_query", async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith("circle_")) {
        const cacheId = data.replace("circle_", "");
        const videoUrl = videoCache.get(cacheId);

        if (!videoUrl) return bot.answerCallbackQuery(q.id, { text: "❌ Ссылка устарела" });

        const loading = await bot.sendMessage(chatId, "⏳ Создаю видео-сообщение (кружок)...");
        try {
            const output = `circle_${Date.now()}.mp4`;
            await toCircle(videoUrl, output);
            await bot.sendVideoNote(chatId, output);
            if (fs.existsSync(output)) fs.unlinkSync(output);
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, "❌ Не удалось создать кружок");
        }
    }
    
    // Админ-функции (статистика и прочее)
    if (data === "admin_stats") {
        bot.sendMessage(chatId, `📊 Статистика:\n👥 Юзеров: ${users.size}\n📥 Загрузок: ${totalDownloads}\n⚡ Запросов: ${totalRequests}`);
    }
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;
    if (bannedUsers.has(userId)) return bot.sendMessage(chatId, "🚫 Вы заблокированы");

    users.add(userId);

    if (text === "📥 Скачать видео") return bot.sendMessage(chatId, "📎 Отправь мне ссылку на TikTok");
    if (text === "⚙️ Админ панель" && userId === ADMIN_ID) {
        return bot.sendMessage(chatId, "🛠 Панель управления", {
            reply_markup: {
                inline_keyboard: [[{ text: "📊 Статистика", callback_data: "admin_stats" }]]
            }
        });
    }

    // Поиск ссылок
    const links = text.match(/https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/g);
    if (!links) return;

    totalRequests++;

    for (const link of links) {
        const waitMsg = await bot.sendMessage(chatId, "⏳ Обработка видео...");
        
        try {
            const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`;
            const response = await axios.get(api);
            const resData = response.data.data;

            if (!resData) throw new Error("Video not found");

            const videoUrl = resData.hdplay || resData.play;
            const cacheId = Math.random().toString(36).substring(7);
            videoCache.set(cacheId, videoUrl);

            // Скачиваем видео в буфер для отправки файлом
            const videoStream = await axios({ url: videoUrl, responseType: "stream" });

            await bot.sendVideo(chatId, videoStream.data, {
                caption: `✅ Видео скачано!\n\n👤 Автор: ${resData.author.unique_id}`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔘 Сделать кружок", callback_data: `circle_${cacheId}` }],
                        [{ text: "🔗 Прямая ссылка", url: videoUrl }]
                    ]
                }
            });

            totalDownloads++;
            bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});

        } catch (err) {
            console.error("Download error:", err.message);
            bot.editMessageText("❌ Ошибка при скачивании. Возможно, видео удалено или приватное.", {
                chat_id: chatId,
                message_id: waitMsg.message_id
            });
        }
    }
});

// Глобальный отлов ошибок
process.on("unhandledRejection", (reason) => console.log("Rejection:", reason));
process.on("uncaughtException", (err) => console.log("Exception:", err));
