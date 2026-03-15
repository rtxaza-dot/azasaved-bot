import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import fs from "fs"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155
const PORT = process.env.PORT || 3000

// EXPRESS
const app = express()
app.get("/", (req,res)=>res.send("TikTok bot running 🚀"))
app.listen(PORT)

// TELEGRAM
const bot = new TelegramBot(TOKEN,{polling:true})

console.log("Bot started")

// DATABASE
const DB_FILE = "./users.json"
let users = {}

if(fs.existsSync(DB_FILE)){
users = JSON.parse(fs.readFileSync(DB_FILE))
}

function saveUsers(){
fs.writeFileSync(DB_FILE,JSON.stringify(users,null,2))
}

// CACHE
const videoCache = new Map()

// QUEUE
const queue = []
let processing = false

function addToQueue(task){
queue.push(task)
processQueue()
}

async function processQueue(){

if(processing) return
processing = true

while(queue.length){

const task = queue.shift()

try{
await task()
}catch(e){
console.log(e)
}

}

processing = false

}

// ANTISPAM
const cooldown = new Map()

function antiSpam(userId){

const now = Date.now()

if(cooldown.has(userId)){

const diff = now - cooldown.get(userId)

if(diff < 2000) return true

}

cooldown.set(userId, now)
return false

}

// FORMAT
function format(num){

if(!num) return "0"

if(num >= 1000000) return (num/1000000).toFixed(1)+"M"
if(num >= 1000) return (num/1000).toFixed(1)+"K"

return num.toString()

}

// DOWNLOAD COUNT
function addDownload(user){

const id = user.id
const name = user.username ? "@"+user.username : user.first_name

if(!users[id]){
users[id] = {name,downloads:1,invited:0}
}else{
users[id].downloads++
users[id].name = name
}

saveUsers()

}

// INVITE COUNT
function addInvite(ref){

if(!users[ref]) return

users[ref].invited = (users[ref].invited || 0) + 1

saveUsers()

}

// START REF
bot.onText(/\/start (.+)/,(msg,match)=>{

const ref = match[1]
const id = msg.from.id

if(ref && ref != id){
addInvite(ref)
}

})

// START
bot.onText(/\/start/,msg=>{

bot.sendMessage(
msg.chat.id,
`🎬 TikTok Downloader

Отправь ссылку TikTok
и бот скачает видео без водяного знака.`,
{
reply_markup:{
keyboard:[
["📊 Статистика","🏆 Топ"],
["👥 Пригласить друзей"]
],
resize_keyboard:true
}
}
)

})

// MESSAGE
bot.on("message", async msg=>{

const text = msg.text
const chatId = msg.chat.id
const userId = msg.from.id

if(!text || text.startsWith("/")) return

if(antiSpam(userId)){
bot.sendMessage(chatId,"⏳ Подожди пару секунд")
return
}

// STAT
if(text==="📊 Статистика"){

let total=0

Object.values(users).forEach(u=>{
total+=u.downloads
})

bot.sendMessage(chatId,
`📊 Статистика

👤 Пользователи: ${Object.keys(users).length}
📥 Скачано: ${total}`
)

return
}

// TOP
if(text==="🏆 Топ"){

const top = Object.values(users)
.sort((a,b)=>b.downloads-a.downloads)
.slice(0,10)

let message="🏆 Топ пользователей\n\n"

top.forEach((u,i)=>{
message+=`${i+1}. ${u.name} — ${u.downloads}\n`
})

bot.sendMessage(chatId,message)

return
}

// INVITE
if(text==="👥 Пригласить друзей"){

const invited = users[userId]?.invited || 0

bot.sendMessage(chatId,
`👥 Приглашено: ${invited}

Твоя ссылка:
https://t.me/${BOT_USERNAME}?start=${userId}`
)

return
}

// BROADCAST
if(text.startsWith("рассылка:") && userId===ADMIN_ID){

const message = text.replace("рассылка:","").trim()

let sent = 0

for(const id of Object.keys(users)){

try{
await bot.sendMessage(id,message)
sent++
}catch{}

}

bot.sendMessage(chatId,`✅ Отправлено ${sent}`)

return
}

// FIND TIKTOK LINK
const links = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/g)

if(!links) return

if(links.length > 5){
bot.sendMessage(chatId,"❌ максимум 5 ссылок")
return
}

// PROCESS
for(const link of links){

addToQueue(async ()=>{

const loading = await bot.sendMessage(chatId,"⏳ Загружаю...")

try{

// CACHE
if(videoCache.has(link)){

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,videoCache.get(link),{
caption:`🎬 TikTok HD | AZA Technology`
})

addDownload(msg.from)
return

}

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
const {data} = await axios.get(api)

await bot.deleteMessage(chatId,loading.message_id)

if(!data?.data){
bot.sendMessage(chatId,"❌ Ошибка загрузки")
return
}

// PHOTO
if(data.data.images){

const media = data.data.images.map(img=>({
type:"photo",
media:img
}))

await bot.sendMediaGroup(chatId,media)

addDownload(msg.from)
return

}

const video = data.data.hdplay || data.data.play

const caption =
`🎬 TikTok HD | AZA Technology

👁 ${format(data.data.play_count)}
❤️ ${format(data.data.digg_count)}`

const sent = await bot.sendVideo(chatId,video,{
caption,
reply_markup:{
inline_keyboard:[
[
{ text:"🎵 Скачать музыку", callback_data:`music_${encodeURIComponent(link)}` }
]
]
}
})

videoCache.set(link, sent.video.file_id)

addDownload(msg.from)

}catch{

bot.sendMessage(chatId,"❌ Ошибка")

}

})

}

})

// MUSIC BUTTON
bot.on("callback_query", async query=>{

const data = query.data
const chatId = query.message.chat.id

if(data.startsWith("music_")){

const link = decodeURIComponent(data.replace("music_",""))

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
const {data:res} = await axios.get(api)

const music = res.data.music

await bot.sendAudio(chatId,music,{
title:"TikTok Sound"
})

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
