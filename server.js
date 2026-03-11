import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("🚀 BOT STARTED");

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Привет! Пришли мне ссылку на TikTok или YouTube (Shorts тоже работают).");
});

bot.on("message", async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (!text || text.startsWith("/")) return;

    const statusMsg = await bot.sendMessage(chatId, "⏳ Обработка ссылки...");

    try {
        // --- ТИКТОК ---
        if (text.includes("tiktok.com")) {
            const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`);
            const data = await res.json();

            if (data.data && data.data.play) {
                await bot.sendVideo(chatId, data.data.play);
                bot.deleteMessage(chatId, statusMsg.message_id);
                return;
            }
        }

        // --- YOUTUBE / SHORTS ---
        if (text.includes("youtube.com") || text.includes("youtu.be")) {
            const res = await fetch("https://api.cobalt.tools/api/json", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    url: text,
                    videoQuality: "720", // Оптимально для Telegram
                })
            });

            const data = await res.json();

            // Cobalt может вернуть статус 'stream', 'video', 'picker' или 'error'
            if (data.url) {
                await bot.sendVideo(chatId, data.url);
                bot.deleteMessage(chatId, statusMsg.message_id);
                return;
            } else if (data.status === "error") {
                console.error("Cobalt Error:", data.text);
            }
        }

        bot.sendMessage(chatId, "❌ Не удалось найти видео по этой ссылке.");

    } catch (e) {
        console.error("Ошибка системы:", e);
        bot.sendMessage(chatId, "❌ Произошла ошибка при загрузке.");
    }
});
