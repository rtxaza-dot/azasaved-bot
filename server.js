import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000
const ADMIN_ID = Number(process.env.ADMIN_ID)
const BOT_USERNAME = "AZASAVED_bot"

if (!TOKEN) {
  console.log("❌ TOKEN missing")
  process.exit(1)
}

// 🌐 express (для Railway / Render)
const app = express()
app.get("/", (req, res) => res.send("Bot running"))
app.listen(PORT, () => console.log("🌐 Server running"))

// 🤖 bot
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("🤖 Bot started")

// 🧠 cache
const cache = new Map()

// 📦 очередь
const queue = []
let working = false

function addQueue(task) {
  queue.push(task)
  runQueue()
}

async function runQueue() {
  if (working) return
  working = true

  while (queue.length) {
    const job = queue.shift()
    try {
      await job()
    } catch (e) {
      console.log("Queue error:", e)
    }
  }

  working = false
}

// 🚫 антиспам
const cooldown = new Map()

function antiSpam(id) {
  const now = Date.now()
  if (cooldown.has(id)) {
    if (now - cooldown.get(id) < 1500) return true
  }
  cooldown.set(id, now)
  return false
}

// 📥 TikTok API
async function getTikTokData(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
  const { data } = await axios.get(api)

  return {
    video: data.data.hdplay || data.data.play,
    music: data.data.music
  }
}

// 📋 меню
function menu(chatId, userId) {
  const buttons = [
    [{ text: "💖 Поддержать", callback_data: "donate" }]
  ]

  if (userId === ADMIN_ID) {
    buttons.push([{ text: "⚙️ Админ", callback_data: "admin" }])
  }

  bot.sendMessage(chatId, "🎬 TikTok Downloader", {
    reply_markup: { inline_keyboard: buttons }
  })
}

// ▶️ start
bot.onText(/\/start/, msg => {
  menu(msg.chat.id, msg.from.id)
})

// 🔘 кнопки
bot.on("callback_query", async q => {
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if (data === "donate") {
    bot.sendMessage(chatId, "💖 Поддержка:\n👉 @AZAkzn1")
  }

  if (data === "admin" && userId === ADMIN_ID) {
    bot.sendMessage(chatId, "⚙️ Бот работает стабильно ✅")
  }

  if (data.startsWith("music_")) {
    try {
      const link = decodeURIComponent(data.replace("music_", ""))
      const res = await getTikTokData(link)

      await bot.sendAudio(chatId, res.music, {
        title: "TikTok Sound"
      })
    } catch {
      bot.sendMessage(chatId, "❌ Ошибка музыки")
    }
  }
})

// 💬 сообщения
bot.on("message", async msg => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  if (!msg.text) return

  const links = msg.text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if (!links) return

  if (antiSpam(userId)) return

  for (const link of links) {
    addQueue(async () => {

      const loading = await bot.sendAnimation(
        chatId,
        "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif"
      )

      try {
        // ⚡ cache
        if (cache.has(link)) {
          await bot.deleteMessage(chatId, loading.message_id)

          return bot.sendVideo(chatId, cache.get(link), {
            caption: `📥 Скачано через @${BOT_USERNAME}`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "💾 Скачать", url: cache.get(link) }],
                [{ text: "🎵 Музыка", callback_data: `music_${encodeURIComponent(link)}` }]
              ]
            }
          })
        }

        const data = await getTikTokData(link)

        await bot.deleteMessage(chatId, loading.message_id)

        const sent = await bot.sendVideo(chatId, data.video, {
          caption: `📥 Скачано через @${BOT_USERNAME}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "💾 Скачать", url: data.video }],
              [{ text: "🎵 Музыка", callback_data: `music_${encodeURIComponent(link)}` }]
            ]
          }
        })

        cache.set(link, sent.video.file_id)

      } catch (e) {
        console.log("Download error:", e)
        bot.sendMessage(chatId, "❌ Ошибка загрузки")
      }
    })
  }
})

// 🛡 защита от крашей
process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
