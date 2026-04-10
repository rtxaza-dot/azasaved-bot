import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"
import ffmpeg from "fluent-ffmpeg"
import fs from "fs"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3001 // 👈 поменяли порт
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155

if (!TOKEN) {
  console.log("❌ TOKEN missing")
  process.exit(1)
}

// server (без падений)
const app = express()
app.get("/", (req, res) => res.send("Bot running"))

app.listen(PORT, () => {
  console.log(`🌐 Server started on ${PORT}`)
})

// bot
const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 300,
    autoStart: true
  }
})

console.log("🤖 Bot started")

// storage
const users = new Set()
const bannedUsers = new Set()
const adminState = {}

let totalDownloads = 0
let totalRequests = 0

// очистка сообщений
const lastMessages = new Map()

function clearChat(chatId) {
  if (!lastMessages.has(chatId)) return
  for (const id of lastMessages.get(chatId)) {
    bot.deleteMessage(chatId, id).catch(() => {})
  }
  lastMessages.set(chatId, [])
}

function track(chatId, msg) {
  if (!lastMessages.has(chatId)) lastMessages.set(chatId, [])
  lastMessages.get(chatId).push(msg.message_id)
}

// антиспам
const cooldown = new Map()
function isSpam(id) {
  const now = Date.now()
  if (cooldown.has(id) && now - cooldown.get(id) < 1500) return true
  cooldown.set(id, now)
  return false
}

// кружок
async function toCircle(videoUrl, output) {
  const input = `input_${Date.now()}.mp4`

  const res = await axios({ url: videoUrl, responseType: "stream" })
  const writer = fs.createWriteStream(input)
  res.data.pipe(writer)

  await new Promise(r => writer.on("finish", r))

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

// меню
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
  })
}

// START
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  users.add(userId)

  bot.sendMessage(chatId,
`👋 Привет!

🎬 Я скачиваю видео из TikTok без водяного знака

📎 Отправь ссылку — и я скачаю 🚀`
  )

  mainMenu(chatId, userId)
})

// CALLBACK
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if (data === "admin_stats") {
    return bot.sendMessage(chatId,
`👥 ${users.size}
📥 ${totalDownloads}
⚡ ${totalRequests}`)
  }

  if (data === "admin_broadcast") {
    adminState[userId] = "broadcast"
    return bot.sendMessage(chatId, "📢 Отправь сообщение")
  }

  if (data === "admin_ads") {
    adminState[userId] = "ads"
    return bot.sendMessage(chatId, "📣 Отправь рекламу")
  }

  if (data === "admin_ban") {
    adminState[userId] = "ban"
    return bot.sendMessage(chatId, "ID:")
  }

  if (data === "admin_unban") {
    adminState[userId] = "unban"
    return bot.sendMessage(chatId, "ID:")
  }

  // кружок
  if (data.startsWith("circle_")) {
    const video = data.replace("circle_", "")

    const loading = await bot.sendMessage(chatId, "⏳ Делаю кружок...")
    track(chatId, loading)

    try {
      const output = `circle_${Date.now()}.mp4`
      await toCircle(video, output)

      await bot.sendVideoNote(chatId, output)
      fs.unlinkSync(output)

    } catch (e) {
      console.log(e)
      bot.sendMessage(chatId, "❌ Ошибка кружка")
    }
  }
})

// MESSAGE
bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text

  if (!text) return

  if (bannedUsers.has(userId)) {
    return bot.sendMessage(chatId, "🚫 Заблокирован")
  }

  users.add(userId)

  if (text === "📥 Скачать видео") {
    return bot.sendMessage(chatId, "📎 Отправь ссылку TikTok")
  }

  if (text === "👥 Пригласить") {
    return bot.sendMessage(chatId,
`https://t.me/${BOT_USERNAME}?start=${userId}`)
  }

  if (text === "💖 Поддержать") {
    return bot.sendMessage(chatId, "💖 Спасибо ❤️")
  }

  if (text === "⚙️ Админ панель" && userId === ADMIN_ID) {
    return bot.sendMessage(chatId, "⚙️ Админ панель", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 Статистика", callback_data: "admin_stats" }],
          [{ text: "📢 Рассылка", callback_data: "admin_broadcast" }],
          [{ text: "📣 Реклама", callback_data: "admin_ads" }],
          [{ text: "🚫 Бан", callback_data: "admin_ban" }],
          [{ text: "✅ Разбан", callback_data: "admin_unban" }]
        ]
      }
    })
  }

  // админ действия
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

    if (adminState[userId] === "broadcast" || adminState[userId] === "ads") {
      adminState[userId] = null

      for (const id of users) {
        try {
          if (msg.text) await bot.sendMessage(id, msg.text)
        } catch {}
      }

      return bot.sendMessage(chatId, "✅ Отправлено")
    }
  }

  // ссылки
  const links = text.match(/https?:\/\/[^\s]+/g)
  if (!links) return

  if (isSpam(userId)) return

  totalRequests++
  clearChat(chatId)

  for (const link of links) {
    const loading = await bot.sendMessage(chatId, "⏳ Скачиваю...")
    track(chatId, loading)

    try {
      let video = null

      const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
      const { data } = await axios.get(api)

      video = data?.data?.hdplay || data?.data?.play

      if (!video) {
        return bot.sendMessage(chatId, "❌ Видео не найдено")
      }

      const sent = await bot.sendVideo(chatId, video, {
        caption: "📥 Готово",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔘 Сделать кружок", callback_data: `circle_${video}` }],
            [{ text: "💾 Скачать", url: video }]
          ]
        }
      })

      track(chatId, sent)
      totalDownloads++

    } catch (err) {
      console.log(err)
      bot.sendMessage(chatId, "❌ Ошибка скачивания")
    }
  }
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
