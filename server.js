import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.TOKEN;
const PORT = process.env.PORT || 8080;

if (!TOKEN) {
  console.error("TOKEN not found in env");
  process.exit(1);
}

// Railway требует HTTP сервер
const app = express();

app.get("/", (req, res) => {
  res.send("AZASAVED BOT RUNNING");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// Telegram bot
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("Bot started");

// антиспам
const cooldown = new Map();

function antiSpam(userId) {
  const now = Date.now();
  if (cooldown.has(userId) && now - cooldown.get(userId) < 2000) {
    return true;
  }
  cooldown.set(userId, now);
  return false;
}

// команда start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "👋 Отправь ссылку TikTok и я скачаю видео без водяного знака"
  );
});

// обработка сообщений
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (antiSpam(msg.from.id)) {
    bot.sendMessage(chatId, "⏳ Подожди пару секунд");
    return;
  }

  if (!text.includes("tiktok.com")) {
    bot.sendMessage(chatId, "❌ Это не ссылка TikTok");
    return;
  }

  const loading = await bot.sendMessage(chatId, "⚡ Загружаю...");

  try {
    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`;
    const res = await fetch(api);
    const data = await res.json();

    await bot.deleteMessage(chatId, loading.message_id);

    if (data?.data?.play) {
      await bot.sendVideo(chatId, data.data.play, {
        caption: "⚡ Powered by AZA Technology",
      });
    } else {
      bot.sendMessage(chatId, "❌ Не удалось скачать");
    }
  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "❌ Ошибка скачивания");
  }
});

// защита от падений
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
