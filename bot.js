require('dotenv').config();
console.log('=== BUFASO BOT STARTING ===');
console.log('Node environment:', process.env.NODE_ENV);
console.log('Render check:', process.env.RENDER ? '✅ Running on Render' : '❌ Local');

const { Telegraf, session } = require('telegraf');
const express = require('express');

const { handleStart } = require('./handlers/start');
const { handleMainMenu } = require('./handlers/main-menu');
const { setupOrderHandlers } = require('./utils/order-manager');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// 🔧 ДОБАВЛЕНО: Keep Render Alive System
app.get('/', (req, res) => {
  res.send('🤖 BuFaso Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BuFaso Bot',
    uptime: process.uptime()
  });
});

// 🔧 ДОБАВЛЕНО: Auto-ping для Render
const startKeepAlive = () => {
  const pingInterval = 14 * 60 * 1000; // 14 минут
  
  const pingServer = async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://bufaso-bot.onrender.com';
      const response = await fetch(`${baseUrl}/health`);
      console.log('🔄 Auto-ping:', response.status, new Date().toLocaleTimeString());
    } catch (error) {
      console.log('⚠️ Ping failed:', error.message);
    }
  };
  
  // Первый пинг через 1 минуту после старта
  setTimeout(pingServer, 60000);
  
  // Затем каждые 14 минут
  setInterval(pingServer, pingInterval);
  
  console.log('✅ Keep-alive system started');
};

// Инициализация сессии с корзиной
bot.use(session({
  defaultSession: () => ({
    cart: []
  })
}));

// Регистрация обработчиков
handleStart(bot);
handleMainMenu(bot);
setupOrderHandlers(bot);

// Запуск Express сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
  console.log('🚀 BuFaso_bot запущен в продакшене!');
  
  // 🔧 ДОБАВЛЕНО: Запускаем keep-alive только на Render
  if (process.env.RENDER) {
    startKeepAlive();
  }
});

// Элегантное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));