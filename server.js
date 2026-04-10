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

// админ
const adminState = {}

// бан
const bannedUsers = new Set()

// статистика
let totalDownloads = 0
let totalRequests = 0

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

// 🎬 СДЕЛАТЬ КРУЖОК
async function toCircle(videoUrl, output){
  const input = `input_${Date.now()}.mp4`

  const response = await axios({
    url: videoUrl,
    method: "GET",
    responseType: "stream"
  })

  const writer = fs.createWriteStream(input)
  response.data.pipe(writer)

  await new Promise(res=>writer.on("finish",res))

  return new Promise((resolve,reject)=>{
    ffmpeg(input)
      .videoFilters("crop='min(iw,ih)':'min(iw,ih)',scale=640:640")
      .output(output)
      .on("end", ()=>{
        fs.unlinkSync(input)
        resolve()
      })
      .on("error", reject)
      .run()
  })
}

// меню
function menu(chatId,userId){
  const buttons = [
    [{text:"💖 Поддержать",callback_data:"donate"}],
    [{text:"👥 Пригласить",callback_data:"invite"}]
  ]

  if(userId === ADMIN_ID){
    buttons.push([{text:"⚙️ Админ панель",callback_data:"admin"}])
  }

  bot.sendMessage(chatId,"🎬 TikTok Downloader",{
    reply_markup:{inline_keyboard:buttons}
  })
}

// start
bot.onText(/\/start/, msg=>{
  const chatId = msg.chat.id
  const userId = msg.from.id

  bot.sendMessage(chatId,
`👋 Привет!

📥 Отправь ссылку TikTok — я скачаю без водяного знака 🎬`
  )

  menu(chatId,userId)
})

// кнопки
bot.on("callback_query", async q=>{
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data = q.data

  if(data==="invite"){
    bot.sendMessage(chatId,
`👥 https://t.me/${BOT_USERNAME}?start=${userId}`)
  }

  if(data==="donate"){
    bot.sendMessage(chatId,"💖 Спасибо за поддержку ❤️")
  }

  // 🔘 СДЕЛАТЬ КРУЖОК
  if(data.startsWith("circle_")){
    const video = data.replace("circle_","")

    const loading = await bot.sendMessage(chatId,"⏳ Делаю кружок...")

    try{
      const output = `circle_${Date.now()}.mp4`

      await toCircle(video, output)

      await bot.sendVideoNote(chatId, output)

      fs.unlinkSync(output)
      bot.deleteMessage(chatId,loading.message_id)

    }catch{
      bot.sendMessage(chatId,"❌ Ошибка при создании кружка")
    }
  }

  // админка
  if(data==="admin" && userId===ADMIN_ID){
    bot.sendMessage(chatId,"⚙️ Админ панель",{
      reply_markup:{
        inline_keyboard:[
          [{text:"📊 Статистика",callback_data:"admin_stats"}],
          [{text:"📢 Рассылка",callback_data:"admin_broadcast"}],
          [{text:"🚫 Бан",callback_data:"admin_ban"}],
          [{text:"✅ Разбан",callback_data:"admin_unban"}]
        ]
      }
    })
  }

  if(data==="admin_stats"){
    bot.sendMessage(chatId,
`👥 ${Object.keys(users).length}
📥 ${totalDownloads}
⚡ ${totalRequests}`)
  }

  if(data==="admin_broadcast"){
    adminState[userId] = "broadcast"
    bot.sendMessage(chatId,"📢 Отправь сообщение")
  }

  if(data==="admin_ban"){
    adminState[userId] = "ban"
    bot.sendMessage(chatId,"ID юзера:")
  }

  if(data==="admin_unban"){
    adminState[userId] = "unban"
    bot.sendMessage(chatId,"ID юзера:")
  }
})

// сообщения
bot.on("message", async msg=>{
  const chatId = msg.chat.id
  const userId = msg.from.id

  if(!msg.text) return

  const text = msg.text

  if(bannedUsers.has(userId)){
    return bot.sendMessage(chatId,"🚫 Заблокирован")
  }

  if(!users[userId]) users[userId]=true

  // бан
  if(userId===ADMIN_ID && adminState[userId]==="ban"){
    bannedUsers.add(Number(text))
    adminState[userId]=null
    return bot.sendMessage(chatId,"🚫 Забанен")
  }

  if(userId===ADMIN_ID && adminState[userId]==="unban"){
    bannedUsers.delete(Number(text))
    adminState[userId]=null
    return bot.sendMessage(chatId,"✅ Разбанен")
  }

  // рассылка
  if(userId===ADMIN_ID && adminState[userId]==="broadcast"){
    adminState[userId]=null
    for(const id of Object.keys(users)){
      try{
        await bot.sendMessage(id,text)
      }catch{}
    }
    return bot.sendMessage(chatId,"✅ Отправлено")
  }

  const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)
  if(!links) return

  if(antiSpam(userId)) return

  totalRequests++

  for(const link of links){
    addQueue(async ()=>{
      const loading = await bot.sendMessage(chatId,"⏳ Скачиваю...")

      try{
        const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
        const {data} = await axios.get(api)

        const video = data.data.hdplay || data.data.play

        await bot.deleteMessage(chatId,loading.message_id)

        await bot.sendVideo(chatId, video,{
          caption:"📥 Готово",
          reply_markup:{
            inline_keyboard:[
              [{text:"🔘 Сделать кружок",callback_data:`circle_${video}`}],
              [{text:"💾 Скачать", url: video}]
            ]
          }
        })

        totalDownloads++

      }catch{
        bot.sendMessage(chatId,"❌ Ошибка")
      }
    })
  }
})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
