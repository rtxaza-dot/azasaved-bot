import TelegramBot from "node-telegram-bot-api";

// Замени на свой токен или используй process.env.TOKEN
const TOKEN = process.env.TOKEN;

const bot = new TelegramBot(TOKEN, { polling: true });

console.log("✅ Бот запущен и готов к работе!");

// Команда /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 Привет! Я помогу скачать видео.\n\nОтправь мне ссылку на **TikTok** или **YouTube (Shorts)**.");
});

// Основная логика обработки сообщений
bot.on("message", async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    // Игнорируем команды и пустые сообщения
    if (!text || text.startsWith("/")) return;

    const statusMsg = await bot.sendMessage(chatId, "⏳ Обработка ссылки...");

    try {
        let videoUrl = null;

        // --- ЛОГИКА ДЛЯ TIKTOK ---
        if (text.includes("tiktok.com")) {
            const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`);
            const data = await res.json();
            
            if (data?.data?.play) {
                videoUrl = data.data.play;
            }
        }

        // --- ЛОГИКА ДЛЯ YOUTUBE & SHORTS ---
        else if (text.includes("youtube.com") || text.includes("youtu.be")) {
            const res = await fetch("https://api.cobalt.tools/api/json", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    url: text,
                    videoQuality: "720",
                    filenamePattern: "basic"
                })
            });

            const data = await res.json();
            
            // Cobalt может вернуть ссылку в разных полях в зависимости от типа контента
            videoUrl = data.url || data.stream || (data.picker && data.picker[0]?.url);
        }

        // --- ОТПРАВКА РЕЗУЛЬТАТА ---
        if (videoUrl) {
            await bot.sendVideo(chatId, videoUrl, {
                reply_to_message_id: msg.message_id
            });
            // Удаляем сообщение о загрузке, чтобы не мешало
            bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        } else {
            bot.editMessageText("❌ Не удалось получить прямую ссылку на видео. Возможно, оно защищено или сервер перегружен.", {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
        }

    } catch (error) {
        console.error("Ошибка при скачивании:", error);
        bot.editMessageText("❌ Произошла ошибка на сервере. Попробуй позже.", {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
    }
});
