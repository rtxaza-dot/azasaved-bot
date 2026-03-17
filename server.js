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
    if(now - cooldown.get(id) < 2000) return true
  }
  cooldown.set(id,now)
  return false
}

// меню
function menu(chatId,userId){
  const buttons = [
    [{text:"📥 Скачать TikTok",callback_data:"download"}],
    [{text:"💖 Поддержать создателя",callback_data:"donate"}],
    [{text:"👥 Пригласить",callback_data:"invite"}]
  ]

  if(userId === ADMIN_ID){
    buttons.push([{text:"⚙️ Админ панель",callback_data:"admin"}])
  }

  bot.sendMessage(chatId,
`🎬 TikTok HD Downloader

Отправь ссылку TikTok`,
  { reply_markup:{inline_keyboard:buttons} }
  )
}

// start
bot.onText(/\/start/, msg=>{
  menu(msg.chat.id,msg.from.id)
})

// кнопки
bot.on("callback_query", async q=>{
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if(data==="download"){
    bot.sendMessage(chatId,"📥 Отправь ссылку TikTok")
  }

  if(data==="invite"){
    bot.sendMessage(chatId,
`👥 Приглашай друзей:
https://t.me/${BOT_USERNAME}?start=${userId}`)
  }

  // 💖 донат
  if(data==="donate"){
    bot.sendMessage(chatId,
`💖 Поддержать создателя

Если тебе нравится бот — можешь поддержать 🙌

💳 Click / Payme / карта:
XXXX XXXX XXXX XXXX

ИЛИ напиши мне в ЛС 👉 @your_username`)
  }

  // админ
  if(data==="admin" && userId===ADMIN_ID){
    bot.sendMessage(chatId,"⚙️ Админ панель",{
      reply_markup:{
        inline_keyboard:[
          [{text:"📢 Рассылка",callback_data:"admin_broadcast"}]
        ]
      }
    })
  }

  if(data==="admin_broadcast" && userId===ADMIN_ID){
    adminState[userId] = "broadcast"
    bot.sendMessage(chatId,"📢 Отправь сообщение / фото / видео")
  }
})

// сообщения
bot.on("message", async msg=>{
  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text

  // регистрация
  if(!users[userId]){
    users[userId] = true
  }

  // рассылка
  if(userId===ADMIN_ID && adminState[userId]==="broadcast"){
    adminState[userId] = null

    let sent = 0

    for(const id of Object.keys(users)){
      try{
        if(msg.text){
          await bot.sendMessage(id,msg.text)
        }
        else if(msg.photo){
          const photo = msg.photo[msg.photo.length-1].file_id
          await bot.sendPhoto(id,photo,{caption:msg.caption||""})
        }
        else if(msg.video){
          await bot.sendVideo(id,msg.video.file_id,{caption:msg.caption||""})
        }

        sent++
      }catch{}
    }

    bot.sendMessage(chatId,`✅ Отправлено: ${sent}`)
    return
  }

  if(!text || text.startsWith("/")) return

  if(antiSpam(userId)){
    bot.sendMessage(chatId,"⏳ Подожди пару секунд")
    return
  }

  const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if(!links) return

  for(const link of links){
    addQueue(async ()=>{
      const loading = await bot.sendMessage(chatId,"⏳ Загружаю...")

      try{
        if(cache.has(link)){
          await bot.deleteMessage(chatId,loading.message_id)
          await bot.sendVideo(chatId,cache.get(link))
          return
        }

        const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
        const {data} = await axios.get(api)

        if(data.data.images){
          const media = data.data.images.map(i=>({type:"photo",media:i}))
          await bot.sendMediaGroup(chatId,media)
          return
        }

        const video = data.data.hdplay || data.data.play
        const author = data.data.author?.unique_id || "unknown"

        const sent = await bot.sendVideo(chatId,video,{
          caption:`🎬 TikTok\n👤 @${author}`
        })

        cache.set(link,sent.video.file_id)

      }catch{
        bot.sendMessage(chatId,"❌ Ошибка загрузки")
      }
    })
  }
})

// музыка
bot.on("callback_query", async q=>{
  const data = q.data
  if(!data.startsWith("music_")) return

  const chatId = q.message.chat.id
  const link = decodeURIComponent(data.replace("music_",""))

  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
  const {data:res} = await axios.get(api)

  await bot.sendAudio(chatId,res.data.music,{title:"TikTok Sound"})
})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
