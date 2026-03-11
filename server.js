import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000

const bot = new TelegramBot(TOKEN)
const app = express()

const cache = new Map()

console.log("🚀 AZASAVED BOT STARTED")

// WEBHOOK
bot.setWebHook(`https://yourdomain.com/bot${TOKEN}`)

app.use(express.json())

app.post(`/bot${TOKEN}`, (req,res)=>{
bot.processUpdate(req.body)
res.sendStatus(200)
})


// START
bot.onText(/\/start/, (msg)=>{

bot.sendMessage(msg.chat.id,
`👋 Добро пожаловать в AZASAVED BOT

📥 Поддержка:
• TikTok
• Instagram

Отправьте ссылку`,
{
reply_markup:{
keyboard:[
["📥 Скачать медиа"],
["ℹ️ Помощь","📢 Канал"],
["👨‍💻 Разработчик"]
],
resize_keyboard:true
}
})

})


// СООБЩЕНИЯ
bot.on("message", async(msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(!text || text.startsWith("/")) return
if(!text.includes("http")) return

bot.sendMessage(chatId,"⚡ Получаю медиа...")

try{

// TIKTOK
if(text.includes("tiktok")){

const api = `https://www.tikwm.com/api/?url=${text}`

const res = await fetch(api)
const data = await res.json()

const id = Date.now()

cache.set(id,{
hd:data.data.hdplay,
sd:data.data.play
})

bot.sendMessage(chatId,
"🎬 Выберите качество",
{
reply_markup:{
inline_keyboard:[
[
{ text:"HD",callback_data:`hd_${id}`},
{ text:"SD",callback_data:`sd_${id}`}
]
]
}
})

}


// INSTAGRAM
if(text.includes("instagram")){

const api = `https://api.vreden.my.id/api/igdl?url=${text}`

const res = await fetch(api)
const data = await res.json()

for(const media of data.result){

if(media.type === "video"){
await bot.sendVideo(chatId,media.url)
}else{
await bot.sendPhoto(chatId,media.url)
}

}

}

}catch(err){

console.log(err)
bot.sendMessage(chatId,"❌ Не удалось скачать")

}

})


// INLINE КНОПКИ
bot.on("callback_query", async(query)=>{

const data = query.data
const chatId = query.message.chat.id

const [quality,id] = data.split("_")

const video = cache.get(Number(id))

if(!video) return

if(quality === "hd"){
await bot.sendVideo(chatId,video.hd)
}

if(quality === "sd"){
await bot.sendVideo(chatId,video.sd)
}

})


// SERVER
app.listen(PORT,()=>{
console.log("SERVER RUNNING "+PORT)
})
