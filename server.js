import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"
import ffmpeg from "fluent-ffmpeg"
import fs from "fs"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155

const START_IMAGE = "https://t3.ftcdn.net/jpg/19/69/79/14/360_F_1969791443_yb6AQYxFAvvlB78Q3Lqv6JVbtjuC9ZAT.jpg"

if (!TOKEN) {
  console.log("❌ TOKEN missing")
  process.exit(1)
}

// 🌐 Express (для хостинга)
const app = express()
app.get("/", (req, res) => res.send("Bot running"))
app.listen(PORT, () => console.log("🌐 Server started"))

// 🤖 Bot
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("🤖 Bot started")

// 🧠 Хранилище
const users = new Set()
const bannedUsers = new Set()
const adminState = {}

let totalDownloads = 0
let totalRequests = 0

// ⚡ Антиспам
const cooldown = new Map()
function isSpam(id) {
  const now = Date.now()
  if (cooldown.has(id) && now - cooldown.get(id) < 1500) return true
  cooldown.set(id, now)
  return false
}

// 🎬 Конвертация в кружок
async function toCircle(videoUrl, output) {
  const input = `input_${Date.now()}.mp4`

  const response = await axios({
    url: videoUrl,
    method: "GET",
    responseType: "stream"
  })

  const writer = fs.createWriteStream(input)
  response.data.pipe(writer)

  await new Promise(res => writer.on("finish", res))

  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters("crop='min(iw,ih)':'min(iw,ih)',scale=640:640")
      .output(output)
      .on("end", () => {
        fs.unlinkSync(input)
        resolve()
      })
      .on("error", reject)
      .run()
  })
}

// 🚀 START
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  users.add(userId)

  const buttons = [
    [
      { text: "📥 Скачать", callback_data: "help" },
      { text: "👥 Пригласить", callback_data: "invite" }
    ],
    [
      { text: "💖 Поддержать", callback_data: "donate" }
    ]
  ]

  if (userId === ADMIN_ID) {
    buttons.push([{ text: "⚙️ Админ панель", callback_data: "admin" }])
  }

  bot.sendPhoto(chatId, START_IMAGE, {
    caption: `👋 Привет!

🎬 Я скачиваю видео из TikTok без водяного знака

📎 Просто отправь ссылку — и я сразу скачаю 🚀`,
    reply_markup: {
      inline_keyboard: buttons
    }
  })
})

// 🎛 КНОПКИ
bot.on("callback_query", async q => {
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if (data === "help") {
    return bot.sendMessage(chatId,
`📥 Как скачать видео:

1. Скопируй ссылку TikTok
2. Отправь сюда

🚀 Я скачаю без водяного знака`)
  }

  if (data === "invite") {
    return bot.sendMessage(chatId,
`👥 https://t.me/${BOT_USERNAME}?start=${userId}`)
  }

  if (data === "donate") {
    return bot.sendMessage(chatId, "💖 Спасибо за поддержку ❤️")
  }

  // 🔘 кружок
  if (data.startsWith("circle_")) {
    const video = data.replace("circle_", "")

    const loading = await bot.sendMessage(chatId, "⏳ Делаю кружок...")

    try {
      const output = `circle_${Date.now()}.mp4`

      await toCircle(video, output)
      await bot.sendVideoNote(chatId, output)

      fs.unlinkSync(output)
      bot.deleteMessage(chatId, loading.message_id)

    } catch {
      bot.sendMessage(chatId, "❌ Ошибка при создании кружка")
    }
  }

  // ⚙️ Админка
  if (data === "admin" && userId === ADMIN_ID) {
    return bot.sendMessage(chatId, "⚙️ Админ панель", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 Статистика", callback_data: "admin_stats" }],
          [{ text: "📢 Рассылка", callback_data: "admin_broadcast" }],
          [{ text: "🚫 Бан", callback_data: "admin_ban" }],
          [{ text: "✅ Разбан", callback_data: "admin_unban" }]
        ]
      }
    })
  }

  if (data === "admin_stats") {
    return bot.sendMessage(chatId,
`📊 Статистика:

👥 Пользователей: ${users.size}
📥 Скачиваний: ${totalDownloads}
⚡ Запросов: ${totalRequests}`)
  }

  if (data === "admin_broadcast") {
    adminState[userId] = "broadcast"
    return bot.sendMessage(chatId, "📢 Отправь сообщение")
  }

  if (data === "admin_ban") {
    adminState[userId] = "ban"
    return bot.sendMessage(chatId, "Введи ID:")
  }

  if (data === "admin_unban") {
    adminState[userId] = "unban"
    return bot.sendMessage(chatId, "Введи ID:")
  }
})

// 📩 СООБЩЕНИЯ
bot.on("message", async msg => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text

  if (!text) return

  if (bannedUsers.has(userId)) {
    return bot.sendMessage(chatId, "🚫 Ты заблокирован")
  }

  users.add(userId)

  // 🔧 админ действия
  if (userId === ADMIN_ID) {
    if (adminState[userId] === "ban") {
      bannedUsers.add(Number(text))
      adminState[userId] = null
      return bot.sendMessage(chatId, "🚫 Забанен")
    }

    if (adminState[userId] === "unban") {
      bannedUsers.delete(Number(text))
      adminState[userId] = null
      return bot.sendMessage(chatId, "✅ Разбанен")
    }

    if (adminState[userId] === "broadcast") {
      adminState[userId] = null
      for (const id of users) {
        try {
          await bot.sendMessage(id, text)
        } catch {}
      }
      return bot.sendMessage(chatId, "✅ Отправлено")
    }
  }

  const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if (!links) return

  if (isSpam(userId)) return

  totalRequests++

  for (const link of links) {
    const loading = await bot.sendMessage(chatId, "⏳ Скачиваю...")

    try {
      const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
      const { data } = await axios.get(api)

      const video = data.data.hdplay || data.data.play

      await bot.deleteMessage(chatId, loading.message_id)

      await bot.sendVideo(chatId, video, {
        caption: "📥 Готово",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔘 Сделать кружок", callback_data: `circle_${video}` }],
            [{ text: "💾 Скачать", url: video }]
          ]
        }
      })

      totalDownloads++

    } catch {
      bot.sendMessage(chatId, "❌ Ошибка при скачивании")
    }
  }
})

// ⚠️ ошибки
process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
