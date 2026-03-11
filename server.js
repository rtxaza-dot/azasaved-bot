import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

const bot = new TelegramBot(TOKEN, { polling: true })

console.log("🚀 AZASAVED BOT STARTED")

// команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id

  bot.sendMessage(
    chatId,
    `👋 Добро пожаловать в AZASAVED BOT

📥 Отправь ссылку TikTok и я скачаю видео без водяного знака ⚡`,
    {
      reply_markup: {
        keyboard: [
          ["📥 Скачать TikTok"],
          ["ℹ️ Помощь", "📢 Канал"]
        ],
        resize_keyboard: true
      }
    }
  )
})

bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text

  if (!text) return
  if (text.startsWith("/")) return

  // кнопка скачать
  if (text === "📥 Скачать TikTok") {
    bot.sendMessage(chatId, "📥 Отправь ссылку TikTok")
    return
  }

  // помощь
  if (text === "ℹ️ Помощь") {
    bot.sendMessage(
      chatId,
      `📖 Как пользоваться

1️⃣ Скопируй ссылку TikTok
2️⃣ Отправь её боту
3️⃣ Получи видео без водяного знака`
    )
    return
  }

  // канал
  if (text === "📢 Канал") {
    bot.sendMessage(chatId, "https://t.me/AZATECHNOLOGY_FREE")
    return
  }

  // проверка ссылки
  if (!text.includes("tiktok.com")) {
    bot.sendMessage(chatId, "❌ Это не ссылка TikTok")
    return
  }

  bot.sendMessage(chatId, "⏳ Скачиваю...")

  try {
    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`
    const res = await fetch(api)
    const data = await res.json()

    if (data?.data?.play) {
      await bot.sendVideo(chatId, data.data.play)
      bot.sendMessage(chatId, "⚡ Powered by AZA Technology")
    } else {
      bot.sendMessage(chatId, "❌ Не удалось скачать видео")
    }
  } catch (err) {
    console.log(err)
    bot.sendMessage(chatId, "❌ Ошибка скачивания")
  }
})
