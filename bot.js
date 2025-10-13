require('dotenv').config();
// 🔧 Polyfill for Node.js 16 (безопасно для продакшена)
let fetch;
if (typeof global.fetch === 'function') {
  // Используем встроенный fetch в Node.js 18+
  fetch = global.fetch;
} else {
  // Используем node-fetch для Node.js 16
  fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

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
    uptime: process.uptime(),
    pingSettings: {
      interval: process.env.PING_INTERVAL_MINUTES || '14 (default)',
      delay: process.env.PING_START_DELAY_MINUTES || '1 (default)'
    }
  });
});

// 🔧 ОБНОВЛЕНО: Auto-ping с настраиваемыми интервалами
const startKeepAlive = () => {
  // Читаем настройки из переменных окружения
  const pingIntervalMinutes = parseInt(process.env.PING_INTERVAL_MINUTES) || 14;
  const startDelayMinutes = parseInt(process.env.PING_START_DELAY_MINUTES) || 1;
  
  const pingInterval = pingIntervalMinutes * 60 * 1000; // в миллисекунды
  const startDelay = startDelayMinutes * 60 * 1000; // в миллисекунды
  
  console.log(`🔄 Keep-alive настроен: интервал ${pingIntervalMinutes} мин, задержка старта ${startDelayMinutes} мин`);

  const pingServer = async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://bufaso-bot.onrender.com';
      const response = await fetch(`${baseUrl}/health`);
      console.log('🔄 Auto-ping:', response.status, new Date().toLocaleTimeString());
    } catch (error) {
      console.log('⚠️ Ping failed:', error.message);
    }
  };
  
  // Первый пинг через заданную задержку
  setTimeout(pingServer, startDelay);
  
  // Затем каждые N минут
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