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
bot.sendMessage(chatId,"📥 Скиньте ссылку TikTok или Instagram")
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


const loading = await bot.sendMessage(chatId,"⏳ Получаю видео...")

try{


// TIKTOK
if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${text}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,data.data.play)

}


// INSTAGRAM
if(text.includes("instagram.com")){

const api = `https://api.vreden.my.id/api/igdl?url=${text}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data.result){

for(const media of data.result){

await bot.sendVideo(chatId,media.url)

}

}

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})
