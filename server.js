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

// database
const users = {}

// cache
const cache = new Map()

// queue
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

try{
await job()
}catch(e){
console.log(e)
}

}

working = false

}

// format numbers
function format(n){

if(!n) return "0"

if(n>=1000000) return (n/1000000).toFixed(1)+"M"
if(n>=1000) return (n/1000).toFixed(1)+"K"

return n

}

// anti spam
const cooldown = new Map()

function antiSpam(id){

const now = Date.now()

if(cooldown.has(id)){

const diff = now - cooldown.get(id)

if(diff < 2000) return true

}

cooldown.set(id,now)

return false

}

// menu
function menu(chatId){

bot.sendMessage(
chatId,
`🎬 TikTok HD Downloader

Нажмите кнопку и отправьте ссылку`,
{
reply_markup:{
inline_keyboard:[
[{text:"📥 Скачать TikTok",callback_data:"download"}],
[
{text:"📊 Статистика",callback_data:"stats"},
{text:"🏆 Топ",callback_data:"top"}
],
[{text:"👥 Пригласить друзей",callback_data:"invite"}]
]
}
}
)

}

// start
bot.onText(/\/start/, msg => menu(msg.chat.id))

// buttons
bot.on("callback_query", async q => {

const chatId = q.message.chat.id
const data = q.data
const userId = q.from.id

if(data==="download"){

bot.sendMessage(chatId,"📥 Отправьте ссылку TikTok")

}

if(data==="stats"){

let total=0

Object.values(users).forEach(v=> total+=v)

bot.sendMessage(chatId,
`📊 Статистика

👤 Пользователи: ${Object.keys(users).length}
📥 Скачано: ${total}`)

}

if(data==="top"){

const top = Object.entries(users)
.sort((a,b)=>b[1]-a[1])
.slice(0,10)

let msg="🏆 Топ скачивателей\n\n"

top.forEach((u,i)=>{
msg+=`${i+1}. ${u[0]} — ${u[1]}\n`
})

bot.sendMessage(chatId,msg)

}

if(data==="invite"){

bot.sendMessage(chatId,
`👥 Пригласите друзей

https://t.me/${BOT_USERNAME}?start=${userId}`)

}

})

// message
bot.on("message", async msg => {

const chatId = msg.chat.id
const text = msg.text
const userId = msg.from.id

if(!text || text.startsWith("/")) return

if(antiSpam(userId)){
bot.sendMessage(chatId,"⏳ Подождите пару секунд")
return
}

const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)

if(!links) return

for(const link of links){

addQueue(async ()=>{

const loading = await bot.sendMessage(chatId,"⏳ Загружаю...")

try{

// cache
if(cache.has(link)){

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,cache.get(link))

users[userId]=(users[userId]||0)+1

return
}

await bot.editMessageText("📥 Скачиваю...",{
chat_id:chatId,
message_id:loading.message_id
})

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`

const {data} = await axios.get(api)

await bot.editMessageText("✅ Отправляю...",{
chat_id:chatId,
message_id:loading.message_id
})

if(data.data.images){

const media = data.data.images.map(i=>({
type:"photo",
media:i
}))

await bot.sendMediaGroup(chatId,media)

users[userId]=(users[userId]||0)+1

return
}

const video = data.data.hdplay || data.data.play
const author = data.data.author?.unique_id || "unknown"

const caption =
`🎬 TikTok HD | AZA Technology

👤 @${author}
👁 ${format(data.data.play_count)}
❤️ ${format(data.data.digg_count)}`

const sent = await bot.sendVideo(chatId,video,{
caption,
reply_markup:{
inline_keyboard:[
[
{ text:"🎵 Скачать музыку",callback_data:`music_${encodeURIComponent(link)}`}
]
]
}
})

cache.set(link,sent.video.file_id)

users[userId]=(users[userId]||0)+1

}catch(e){

bot.sendMessage(chatId,"❌ Ошибка загрузки")

}

})

}

})

// music
bot.on("callback_query", async q => {

const data = q.data
const chatId = q.message.chat.id

if(!data.startsWith("music_")) return

const link = decodeURIComponent(data.replace("music_",""))

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`

const {data:res} = await axios.get(api)

const music = res.data.music

await bot.sendAudio(chatId,music,{title:"TikTok Sound"})

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
