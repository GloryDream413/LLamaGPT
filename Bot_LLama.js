import { createRequire } from 'module'
import axios from 'axios'
const require = createRequire(import.meta.url)
const TelegramBot = require('node-telegram-bot-api')
const dotenv = require('dotenv')

const userMessageTime = new Map()

dotenv.config()
const token = process.env.TELEGRAM_BOT_TOKEN
const bot = new TelegramBot(token, { polling: true })
let lastMessageTime = 0
async function createPrediction (text) {
  const response = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version:
        '2014ee1247354f2e81c0b3650d71ca715bc1e610189855f134c30ecb841fae21', //LLama Model
      input: { prompt: text, top_p : 0.95, max_length : 500, temperature : 0.8, repetition_penalty : 1 }
    },
    {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  )

  const prediction = response.data
  console.log("RESULT : ", prediction);
  return prediction
}

async function getPredictionStatus (id) {
  const response = await axios.get(
    'https://api.replicate.com/v1/predictions/' + id,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`
      }
    }
  )

  const prediction = response.data
  return prediction
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const pending = async (sentMessage, chatId, username) => {
  let index = 59
  while (index > 0) {
    index--
    await sleep(1000)
    bot.editMessageText(
      '@' +
        username +
        " You're in cooldown mode please wait " +
        index +
        ' seconds.',
      {
        chat_id: chatId,
        message_id: sentMessage.message_id
      }
    )
  }
}

bot.onText(/\/imagine (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const username = msg.from.username
  const now = Date.now()

  if (userMessageTime.has(chatId)) {
    lastMessageTime = userMessageTime.get(chatId)
    const timeDifference = now - lastMessageTime
    lastMessageTime = now

    if (timeDifference < 15 * 1000) {
      bot
        .sendMessage(
          chatId,
          '@' +
            username +
            " You're in cooldown mode please wait 14 seconds."
        )
        .then(sentMessage => {
          pending(sentMessage, chatId, username)
        })
      return
    }
  }

  userMessageTime.set(chatId, now)
  bot.sendMessage(
    chatId, "Generating ... for @" + username
  )
  
  const prediction = await createPrediction(match[1])
  let response = null
  let nCount = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await sleep(1000);
    nCount++;
    if(nCount >= 60)
    {
      break;
    }
    response = await getPredictionStatus(prediction.id)
    if (response.err || response.output) {
      break
    }
  }
  if (response.output) {
    let result = '';
    for(let i=0;i<response.output.length;i++)
    {
      result += response.output[i];
    }
    bot.sendMessage(chatId, result);
  } else {
    bot.sendMessage(chatId, 'Sorry. could you again please.');
  }
})

if(bot.isPolling()) {
  await bot.stopPolling();
}
await bot.startPolling();