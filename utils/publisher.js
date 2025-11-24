const { google } = require('googleapis');
//const { Telegraf } = require('telegraf');

// Настройка Google Sheets
// Настройка Google Sheets
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// 🔥 AI-ассистент для публикации
class ProductPublisher {
  constructor() {
    // 🔥 ПРАВИЛЬНОЕ ПОЛУЧЕНИЕ ID КАНАЛА
    this.channelId = process.env.ADMIN_CHAT_ID_PUBLIC || process.env.CHANNEL_ID;
    console.log(`📢 Канал для публикаций: ${this.channelId}`);
    
    if (!this.channelId) {
      console.error('❌ ОШИБКА: Не задан ID канала для публикаций!');
      console.error('   Добавь ADMIN_CHAT_ID_PUBLIC в .env файл');
    }
  }

  // ... остальной код без изменений ...


  // Установка бота (вызывается после инициализации)
  setBot(bot) {
    this.bot = bot;
  }

  // Получение неопубликованных товаров
  async getUnpublishedProducts() {
    try {
      console.log('📋 Получение неопубликованных товаров...');
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ForPublishing!A2:R',
      });

      const rows = response.data.values || [];
      console.log(`✅ Найдено товаров: ${rows.length}`);

      const unpublished = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Published в колонке Q (индекс 16)
        if (!row[16] || row[16].toLowerCase() === 'нет') {
          unpublished.push({
            rowIndex: i + 2,
            productId: row[0],
            category: row[1],
            name: row[2],
            description: row[3],
            price: row[4],
            ed_izm: row[5],
            cena1: row[6],
            ed_izm1: row[7],
            cena2: row[8],
            ed_izm2: row[9],
            cena3: row[10],
            ed_izm3: row[11],
            cena4: row[12],
            ed_izm4: row[13],
            imageURL: row[14],
            orderURL: row[15],
            published: row[16]
          });
        }
      }

      console.log(`📦 Неопубликованных товаров: ${unpublished.length}`);
      return unpublished;

    } catch (error) {
      console.error('❌ Ошибка получения товаров:', error);
      return [];
    }
  }

  // Форматирование цен для поста
  formatPrices(product) {
    let pricesText = '';
    
    if (product.price && product.ed_izm) {
      pricesText += `• ${product.ed_izm} - ${product.price}₽\n`;
    }
    
    const variants = [
      { price: product.cena1, ed_izm: product.ed_izm1 },
      { price: product.cena2, ed_izm: product.ed_izm2 },
      { price: product.cena3, ed_izm: product.ed_izm3 },
      { price: product.cena4, ed_izm: product.ed_izm4 }
    ];
    
    variants.forEach(variant => {
      if (variant.price && variant.ed_izm) {
        pricesText += `• ${variant.ed_izm} - ${variant.price}₽\n`;
      }
    });

    return pricesText || '• Цены уточняйте';
  }

  // Создание красивого поста
  createPost(product) {
    const prices = this.formatPrices(product);
    
    return `🛍️ <b>${product.name}</b>

📝 ${product.description}

💰 <b>Цены:</b>
${prices}

👇 <b>Нажмите кнопку ниже для заказа:</b>`;
  }

  // Публикация товара в канал
  async publishProduct(product) {
    try {
      console.log(`📤 Публикация товара: ${product.name}`);
      
      if (!this.bot) {
        throw new Error('Bot not initialized. Call setBot() first.');
      }

      const message = this.createPost(product);
      const keyboard = {
        inline_keyboard: [
          [{ text: '🛒 Заказать', url: product.orderURL }]
        ]
      };

      let result;
      
      if (product.imageURL && product.imageURL.startsWith('http')) {
        result = await this.bot.telegram.sendPhoto(this.channelId, product.imageURL, {
          caption: message,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        result = await this.bot.telegram.sendMessage(this.channelId, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }

      console.log(`✅ Товар опубликован: ${product.name}`);
      return { success: true, messageId: result.message_id };

    } catch (error) {
      console.error(`❌ Ошибка публикации товара ${product.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Обновление статуса публикации
  async markAsPublished(rowIndex) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `ForPublishing!Q${rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [['да']]
        }
      });
      console.log(`✅ Статус обновлен для строки ${rowIndex}`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка обновления статуса:', error);
      return false;
    }
  }

  // Основная функция публикации
  async publishUnpublishedProducts() {
    try {
      console.log('🚀 Запуск публикации товаров...');
      
      const unpublishedProducts = await this.getUnpublishedProducts();
      
      if (unpublishedProducts.length === 0) {
        console.log('ℹ️ Нет товаров для публикации');
        return { published: 0, total: 0 };
      }

      let publishedCount = 0;
      
      for (const product of unpublishedProducts) {
        console.log(`📦 Обработка товара: ${product.name}`);
        
        const result = await this.publishProduct(product);
        
        if (result.success) {
          const updateResult = await this.markAsPublished(product.rowIndex);
          if (updateResult) {
            publishedCount++;
            console.log(`✅ Успешно опубликовано: ${product.name}`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`🎉 Публикация завершена. Опубликовано: ${publishedCount}/${unpublishedProducts.length}`);
      return { published: publishedCount, total: unpublishedProducts.length };

    } catch (error) {
      console.error('❌ Критическая ошибка публикации:', error);
      return { published: 0, total: 0, error: error.message };
    }
  }

  // Предпросмотр товара (для админа)
  async previewProduct(productId, ctx) {
    try {
      const products = await this.getUnpublishedProducts();
      const product = products.find(p => p.productId === productId);
      
      if (!product) {
        await ctx.reply('❌ Товар не найден или уже опубликован');
        return;
      }

      const message = this.createPost(product);
      const keyboard = {
        inline_keyboard: [
          [{ text: '🛒 Заказать', url: product.orderURL }],
          [{ text: '✅ Опубликовать', callback_data: `publish_${productId}` }],
          [{ text: '❌ Отмена', callback_data: 'cancel_publish' }]
        ]
      };

      if (product.imageURL && product.imageURL.startsWith('http')) {
        await ctx.replyWithPhoto(product.imageURL, {
          caption: `👁️ <b>ПРЕДПРОСМОТР</b>\n\n${message}`,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        await ctx.reply(`👁️ <b>ПРЕДПРОСМОТР</b>\n\n${message}`, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }

    } catch (error) {
      console.error('❌ Ошибка предпросмотра:', error);
      await ctx.reply('⚠️ Ошибка при создании предпросмотра');
    }
  }
}

module.exports = { ProductPublisher };