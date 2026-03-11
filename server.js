import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

const bot = new TelegramBot(TOKEN,{ polling:true })

console.log("🚀 AZASAVED BOT STARTED")

const cache = new Map()
const cooldown = new Map()


// START
bot.onText(/\/start/, (msg)=>{

const chatId = msg.chat.id

bot.sendMessage(chatId,
`👋 Добро пожаловать в AZASAVED BOT

📥 Скачивай видео из:
• TikTok
• Instagram`,
{
reply_markup:{
keyboard:[
["📥 Скачать видео"],
["ℹ️ Помощь","📢 Канал"],
["👨‍💻 Разработчик"]
],
resize_keyboard:true
}
})

})


// MESSAGE
bot.on("message", async(msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(!text || text.startsWith("/")) return


// антиспам
const now = Date.now()
const last = cooldown.get(chatId)

if(last && now - last < 3000){
bot.sendMessage(chatId,"⏳ Подождите пару секунд")
return
}

cooldown.set(chatId,now)


// кнопка скачать
if(text === "📥 Скачать видео"){
bot.sendMessage(chatId,
"📥 Скиньте ссылку TikTok или Instagram",
{ reply_markup:{ force_reply:true }})
return
}


// помощь
if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 Как пользоваться

1️⃣ Скопируйте ссылку
2️⃣ Отправьте её боту
3️⃣ Получите видео`)
return
}


// канал
if(text === "📢 Канал"){
bot.sendMessage(chatId,
`📢 Наш канал

https://t.me/AZATECHNOLOGY_FREE`)
return
}


// разработчик
if(text === "👨‍💻 Разработчик"){
bot.sendMessage(chatId,"👨‍💻 Создатель: AZA Technology")
return
}


// если не ссылка
if(!text.includes("http")) return


const loading = await bot.sendMessage(chatId,"⏳ Получаю видео.")

setTimeout(()=>bot.editMessageText("⏳ Получаю видео..",{chat_id:chatId,message_id:loading.message_id}),500)
setTimeout(()=>bot.editMessageText("⏳ Получаю видео...",{chat_id:chatId,message_id:loading.message_id}),1000)


try{

// TIKTOK
if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${text}`
const res = await fetch(api)
const data = await res.json()

const id = Date.now()

cache.set(id,{
hd:data.data.hdplay,
sd:data.data.play
})

await bot.editMessageText("🎬 Выберите качество",
{
chat_id:chatId,
message_id:loading.message_id,
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


// INSTAGRAM (API 1)
if(text.includes("instagram.com")){

try{

const api = `https://api.ryzendesu.vip/api/downloader/igdl?url=${text}`
const res = await fetch(api)
const data = await res.json()

if(data.media){

await bot.deleteMessage(chatId,loading.message_id)

for(const media of data.media){

if(media.type === "video"){
await bot.sendVideo(chatId,media.url)
}

}

return

}

}catch{}


// INSTAGRAM (API 2 fallback)

const api2 = `https://api.vreden.my.id/api/igdl?url=${text}`

const res2 = await fetch(api2)
const data2 = await res2.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data2.result){

for(const media of data2.result){

if(media.type === "video"){
await bot.sendVideo(chatId,media.url)
}

}

}

}

}catch(err){

console.log(err)
bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})


// кнопки качества
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
