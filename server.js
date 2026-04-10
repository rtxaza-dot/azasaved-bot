import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155

if(!TOKEN){
  console.log("TOKEN missing")
  process.exit(1)
}

// express
const app = express()
app.get("/", (req,res)=>res.send("Bot running"))
app.listen(PORT)

// bot
const bot = new TelegramBot(TOKEN,{ polling:true })
console.log("Bot started")

// база
const users = {}

// админ состояние
const adminState = {}

// cache
const cache = new Map()

// очередь
const queue = []
let working = false

function addQueue(task){
  queue.push(task)
  runQueue()
}

async function runQueue(){
  if(working) return
  working = true

  while(queue.length){
    const job = queue.shift()
    try{ await job() }catch(e){ console.log(e) }
  }

  working = false
}

// антиспам
const cooldown = new Map()
function antiSpam(id){
  const now = Date.now()
  if(cooldown.has(id)){
    if(now - cooldown.get(id) < 1500) return true
  }
  cooldown.set(id,now)
  return false
}

// меню
function menu(chatId,userId){
  const buttons = [
    [{text:"💖 Поддержать",callback_data:"donate"}]
  ]

  if(userId === ADMIN_ID){
    buttons.push([{text:"⚙️ Админ панель",callback_data:"admin"}])
  }

  bot.sendMessage(chatId,"🎬 TikTok Downloader",{
    reply_markup:{inline_keyboard:buttons}
  })
}

// 🔥 START + ПРИВЕТСТВИЕ
bot.onText(/\/start/, msg=>{
  const chatId = msg.chat.id
  const userId = msg.from.id

  // приветствие + инструкция
  bot.sendMessage(chatId,
`👋 Добро пожаловать в моего бота!

🎬 Я скачиваю TikTok видео без водяного знака.

📌 Как пользоваться:
1. Скопируй ссылку на TikTok видео
2. Отправь её сюда
3. Получи готовое видео и музыку

⚡ Просто отправь ссылку и всё!

👇 Ниже меню:`)

  menu(chatId,userId)
})

// кнопки
bot.on("callback_query", async q=>{
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if(data==="donate"){
    bot.sendMessage(chatId,`💖 Поддержать создателя\n👉 @AZAkzn1`)
  }

  if(data==="admin" && userId===ADMIN_ID){
    bot.sendMessage(chatId,"⚙️ Админ панель")
  }

  if(data.startsWith("music_")){
    const link = decodeURIComponent(data.replace("music_",""))

    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
    const {data:res} = await axios.get(api)

    await bot.sendAudio(chatId,res.data.music,{title:"TikTok Sound"})
  }
})

// сообщения
bot.on("message", async msg=>{
  const chatId = msg.chat.id
  const userId = msg.from.id

  if(!msg.text) return
  const text = msg.text

  if(!users[userId]){
    users[userId] = true
  }

  const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if(!links) return

  if(antiSpam(userId)) return

  for(const link of links){
    addQueue(async ()=>{
      const userMessageId = msg.message_id

      const loading = await bot.sendAnimation(
        chatId,
        "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif"
      )

      try{
        if(cache.has(link)){
          await bot.deleteMessage(chatId,loading.message_id)
          await bot.deleteMessage(chatId,userMessageId)

          await bot.sendVideo(chatId,cache.get(link),{
            caption:`📥 Скачано через @${BOT_USERNAME}`,
            reply_markup:{
              inline_keyboard:[
                [{text:"💾 Скачать", url: cache.get(link)}],
                [{text:"🎵 Скачать музыку", callback_data:`music_${encodeURIComponent(link)}`}]
              ]
            }
          })
          return
        }

        const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
        const {data} = await axios.get(api)

        const video = data.data.hdplay || data.data.play

        await bot.deleteMessage(chatId,loading.message_id)
        await bot.deleteMessage(chatId,userMessageId)

        const sent = await bot.sendVideo(chatId, video,{
          caption:`📥 Скачано через @${BOT_USERNAME}`,
          reply_markup:{
            inline_keyboard:[
              [{text:"💾 Скачать", url: video}],
              [{text:"🎵 Скачать музыку", callback_data:`music_${encodeURIComponent(link)}`}]
            ]
          }
        })

        cache.set(link, sent.video.file_id)

      }catch{
        bot.sendMessage(chatId,"❌ Ошибка")
      }
    })
  }
})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
