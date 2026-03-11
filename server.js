import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

const bot = new TelegramBot(TOKEN, { polling: true })

console.log("AZASAVED BOT started")

// START
bot.onText(/\/start/, (msg) => {

const chatId = msg.chat.id

bot.sendMessage(chatId,
`👋 Добро пожаловать в AZASAVED BOT

📥 Скачивай видео и фото из:
• TikTok
• Instagram

Нажмите кнопку ниже и отправьте ссылку.`,
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


// ВСЕ СООБЩЕНИЯ
bot.on("message", async (msg) => {

const chatId = msg.chat.id
const text = msg.text

if(!text || text.startsWith("/")) return


// помощь
if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 Как пользоваться ботом

1️⃣ Скопируй ссылку из TikTok или Instagram
2️⃣ Отправь её боту
3️⃣ Получи медиа за пару секунд`)
return
}


// канал
if(text === "📢 Канал"){
bot.sendMessage(chatId,
`📢 Подпишитесь на канал

https://t.me/AZATECHNOLOGY_FREE`)
return
}


// разработчик
if(text === "👨‍💻 Разработчик"){
bot.sendMessage(chatId,
"👨‍💻 Создатель: AZA Technology")
return
}


// скачать
if(text === "📥 Скачать медиа"){
bot.sendMessage(chatId,"📥 Киньте ссылку на видео или фото")
return
}


// если не ссылка
if(!text.includes("http")) return

bot.sendMessage(chatId,"⏳ Скачиваю...")

try{

// ======================
// TIKTOK
// ======================

if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${text}`

const res = await fetch(api)
const data = await res.json()

if(data.data.play){
await bot.sendVideo(chatId,data.data.play)
bot.sendMessage(chatId,"⚡ Powered by AZA Technology")
return
}

}


// ======================
// INSTAGRAM
// ======================

if(text.includes("instagram.com")){

const api = `https://api.vxtiktok.com/instagram?url=${text}`

const res = await fetch(api)
const data = await res.json()

if(data.media && data.media.length > 0){

for(const media of data.media){

if(media.type === "video"){
await bot.sendVideo(chatId,media.url)
}else{
await bot.sendPhoto(chatId,media.url)
}

}

bot.sendMessage(chatId,"⚡ Powered by AZA Technology")
return

}

}


bot.sendMessage(chatId,"❌ Не удалось скачать")

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})
