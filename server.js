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

if (!TOKEN) {
  console.log("TOKEN missing")
  process.exit(1)
}

// server
const app = express()
app.get("/", (req, res) => res.send("Bot running"))
app.listen(PORT)

// bot
const bot = new TelegramBot(TOKEN, { polling: true })

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

// START
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  users.add(userId)

  bot.sendMessage(chatId,
`👋 Привет!

🎬 Я скачиваю видео из TikTok без водяного знака

📎 Отправь ссылку — и я скачаю 🚀`,
  {
    reply_markup: {
      keyboard: [
        ["📥 Скачать видео"],
        ["👥 Пригласить", "💖 Поддержать"],
        ...(userId === ADMIN_ID ? [["⚙️ Админ панель"]] : [])
      ],
      resize_keyboard: true
    }
  })
})

// CALLBACK (inline)
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

    } catch {
      bot.sendMessage(chatId, "❌ Ошибка")
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
    return bot.sendMessage(chatId, "🚫 Ты заблокирован")
  }

  users.add(userId)

  // кнопки
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
          else if (msg.photo) {
            const p = msg.photo[msg.photo.length - 1].file_id
            await bot.sendPhoto(id, p, { caption: msg.caption || "" })
          }
          else if (msg.video) {
            await bot.sendVideo(id, msg.video.file_id, { caption: msg.caption || "" })
          }
        } catch {}
      }

      return bot.sendMessage(chatId, "✅ Отправлено")
    }
  }

  // tiktok
  const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if (!links) return

  if (isSpam(userId)) return

  totalRequests++

  clearChat(chatId)

  for (const link of links) {
    const loading = await bot.sendMessage(chatId, "⏳ Скачиваю...")
    track(chatId, loading)

    try {
      const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
      const { data } = await axios.get(api)

      const video = data.data.hdplay || data.data.play

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

    } catch {
      bot.sendMessage(chatId, "❌ Ошибка")
    }
  }
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
