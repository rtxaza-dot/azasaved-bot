import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

const bot = new TelegramBot(TOKEN,{polling:true})

console.log("AZASAVED BOT started")

bot.onText(/\/start/, (msg)=>{

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

bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 Как пользоваться ботом

1️⃣ Скопируй ссылку из TikTok или Instagram
2️⃣ Отправь её боту
3️⃣ Получи медиа за пару секунд`)
return
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,
`📢 Подпишитесь на канал

https://t.me/AZATECHNOLOGY_FREE`)
return
}

if(text === "👨‍💻 Разработчик"){
bot.sendMessage(chatId,
"👨‍💻 Создатель: AZA Technology")
return
}

if(text === "📥 Скачать медиа"){
bot.sendMessage(chatId,"📥 Киньте ссылку на видео или фото")
return
}

if(!text || !text.includes("http")) return

bot.sendMessage(chatId,"⏳ Скачиваю...")

try{

const api = `https://www.tikwm.com/api/?url=${text}`

const res = await fetch(api)
const data = await res.json()

if(data.data.play){
await bot.sendVideo(chatId,data.data.play)
}

if(data.data.images){
for(const img of data.data.images){
await bot.sendPhoto(chatId,img)
}
}

bot.sendMessage(chatId,"⚡ Powered by AZA Technology")

}catch(err){

bot.sendMessage(chatId,"❌ Не удалось скачать")

}

})
