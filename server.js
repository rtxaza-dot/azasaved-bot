import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import express from "express";
import dotenv from "dotenv";
import Datastore from "nedb";

dotenv.config();

// --- КОНФИГУРАЦИЯ ---
const TOKEN = process.env.TOKEN;
const RAPIDAPI_KEY = "66d468edb1mshb464cad2161835cp1d5727jsn06c2068b6ed3";
const ADMIN_ID = 5331869155;
const BOT_USERNAME = "AZASAVED_bot";

// База данных (Railway Volume: /app/database)
const db = new Datastore({ filename: './database/users.db', autoload: true });
db.persistence.setAutocompactionInterval(60000);

// Защита от спама (храним время последнего запроса юзера)
const floodControl = new Map();

const app = express();
app.get("/", (req, res) => res.send("System: Online 🛡️"));
app.listen(process.env.PORT || 8080);

const bot = new TelegramBot(TOKEN, { polling: true });

// --- СЕРВИСНЫЕ ФУНКЦИИ ---

async function syncDescription() {
    db.count({}, async (err, count) => {
        if (!err) {
            try {
                await bot.setMyDescription({ 
                    description: `${count.toLocaleString()} пользователей используют этот бот 🚀` 
                });
            } catch (e) {}
        }
    });
}

const getKeyboard = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: "💾 Сохранить", callback_data: "save" }, { text: "🎵 Скачать песню", callback_data: "audio" }],
            [{ text: "Добавить в группу ⤴️", url: `https://t.me/${BOT_USERNAME}?startgroup=true` }]
        ]
    }
});

// --- ОСНОВНОЙ ДВИЖОК ЗАГРУЗКИ (3 в 1) ---

async function masterDownloader(chatId, url) {
    // Проверка на флуд (защита)
    const now = Date.now();
    if (floodControl.has(chatId) && (now - floodControl.get(chatId) < 3000)) {
        return bot.sendMessage(chatId, "⚠️ **Защита:** Не спамь! Подожди 3 секунды.");
    }
    floodControl.set(chatId, now);

    const status = await bot.sendMessage(chatId, "⚡ **Обработка ссылки...**", { parse_mode: "Markdown" });
    
    let apiUrl = "", host = "";
    
    // Детектор платформы
    if (url.includes("tiktok.com")) {
        apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    } else if (url.includes("instagram.com")) {
        apiUrl = `https://instagram-reels-downloader-api.p.rapidapi.com/downloadReel?url=${encodeURIComponent(url)}`;
        host = "instagram-reels-downloader-api.p.rapidapi.com";
    } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
        apiUrl = `https://youtube-v31.p.rapidapi.com/download?url=${encodeURIComponent(url)}`;
        host = "youtube-v31.p.rapidapi.com";
    }

    try {
        const res = await fetch(apiUrl, { 
            headers: host ? { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': host } : {},
            timeout: 15000 
        });
        const data = await res.json();
        
        let videoLink = "";
        if (url.includes("tiktok")) videoLink = data.data?.hdplay || data.data?.play;
        else if (url.includes("instagram")) videoLink = data.download_url || (data.links && data.links[0].link);
        else videoLink = data.link;

        await bot.deleteMessage(chatId, status.message_id).catch(() => {});

        if (videoLink) {
            await bot.sendVideo(chatId, videoLink, {
                caption: `📥 Скачано через @${BOT_USERNAME}`,
                ...getKeyboard()
            });
        } else {
            bot.sendMessage(chatId, "❌ Ошибка: Не удалось получить прямое видео. Возможно, профиль закрыт.");
        }
    } catch (e) {
        bot.sendMessage(chatId, "❌ Сервер загрузки временно недоступен.");
    }
}

// --- ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // Регистрация в БД
    db.update({ _id: chatId.toString() }, { $set: { user: msg.from.username, last: new Date() } }, { upsert: true }, () => syncDescription());

    // АДМИНКА
    if (text.startsWith("/send") && chatId === ADMIN_ID) {
        const broadcast = text.replace("/send ", "");
        db.find({}, (err, users) => {
            bot.sendMessage(ADMIN_ID, `📢 Рассылка на ${users.length} чел. запущена...`);
            users.forEach((u, i) => {
                setTimeout(() => bot.sendMessage(u._id, broadcast).catch(() => {}), i * 40);
            });
        });
        return;
    }

    if (text === "/start") {
        return bot.sendMessage(chatId, `🚀 **AZASAVED ULTRA**\n\nПришли ссылку из TikTok, Instagram или YouTube Shorts.\n\nБот абсолютно бесплатен!`, {
            reply_markup: { keyboard: [["📊 Статистика"]], resize_keyboard: true }
        });
    }

    if (text === "📊 Статистика") {
        db.count({}, (err, count) => {
            bot.sendMessage(chatId, `📈 **ДАННЫЕ БОТА**\n\n👤 Всего юзеров: ${count.toLocaleString()}\n🛡 Защита: Активна\n⚡ Скорость: Максимальная`, { parse_mode: "Markdown" });
        });
        return;
    }

    // Обработка ссылок
    if (text.includes("http")) {
        await masterDownloader(chatId, text);
    }
});

bot.on('callback_query', (q) => bot.answerCallbackQuery(q.id));
console.log("🛡️ Бронированный бот запущен...");
