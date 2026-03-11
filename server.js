import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080

// express сервер (Railway требует порт)
const app = express()

app.get("/", (req,res)=>{
  res.send("AZASAVED BOT RUNNING 🚀")
})

app.listen(PORT,()=>{
  console.log("Server running on port", PORT)
})

// telegram bot
const bot = new TelegramBot(TOKEN,{ polling:true })

console.log("🤖 BOT STARTED")

// кэш чтобы быстрее работало
const cache = new Map()

// антиспам
const cooldown = new Map()

function antiSpam(userId){
  const now = Date.now()

  if(cooldown.has(userId)){
    if(now - cooldown.get(userId) < 2000){
      return true
    }
  }

  cooldown.set(userId,now)
  return false
}


// start
bot.onText(/\/start/, (msg)=>{

  const chatId = msg.chat.id

  bot.sendMessage(
    chatId,
`👋 Добро пожаловать в AZASAVED BOT

📥 Отправь ссылку TikTok
и я скачаю видео без водяного знака ⚡`
  )

})


// обработка сообщений
bot.on("message", async (msg)=>{

  const chatId = msg.chat.id
  const text = msg.text
  const userId = msg.from.id

  if(!text) return
  if(text.startsWith("/")) return

  if(antiSpam(userId)){
    bot.sendMessage(chatId,"⏳ Подожди немного")
    return
  }

  if(!text.includes("tiktok.com")){
    bot.sendMessage(chatId,"❌ Это не ссылка TikTok")
    return
  }

  const loading = await bot.sendMessage(chatId,"⚡ Загружаю...")

  try{

    // проверка кэша
    if(cache.has(text)){

      const video = cache.get(text)

      await bot.deleteMessage(chatId,loading.message_id)

      await bot.sendVideo(chatId,video,{
        caption:"⚡ Быстро из кэша"
      })

      return
    }

    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

    const res = await fetch(api)
    const data = await res.json()

    await bot.deleteMessage(chatId,loading.message_id)

    if(data?.data?.play){

      cache.set(text,data.data.play)

      await bot.sendVideo(chatId,data.data.play,{
        caption:"⚡ Powered by AZA Technology"
      })

    }else{

      bot.sendMessage(chatId,"❌ Не удалось скачать видео")

    }

  }catch(err){

    console.log(err)
    bot.sendMessage(chatId,"❌ Ошибка скачивания")

  }

})


// защита от падения
process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
