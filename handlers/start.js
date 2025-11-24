const { getCategories, getProductById } = require('../config/google-sheets');
const { buildMainMenu, buildPriceVariantsKeyboard, formatPriceVariants } = require('../utils/keyboard-builder');
const { getProductImage } = require('../utils/image-handler'); // Добавляем импорт

async function handleStart(bot) {
  bot.start(async (ctx) => {
    try {
      // Получаем параметр из deep link (например, start=1)
      const startPayload = ctx.startPayload;
      
      console.log(`🔍 Start command received with payload: "${startPayload}"`);
      
      // Если есть параметр - это deep link на конкретный товар
      if (startPayload && startPayload.trim() !== '') {
        const productId = startPayload.trim();
        
        console.log(`🎯 Deep link detected, product ID: ${productId}`);
        
        // Используем существующую функцию из google-sheets.js
        const product = await getProductById(productId);
        
        if (product) {
          console.log(`✅ Product found: ${product.name}, Category: ${product.categoryId}`);
          
          // Форматируем сообщение с товаром используя готовую функцию
          const priceText = formatPriceVariants(product.variants);
          
          const message = `
🛍️ <b>${product.name}</b>

📝 ${product.description}
${priceText}

👇 <b>Выберите фасовку:</b>
          `;

          // Используем готовую функцию для создания клавиатуры вариантов цен
          const keyboard = buildPriceVariantsKeyboard(
            product.variants, 
            product.id, 
            product.categoryId
          );

          // 🔥 ИСПРАВЛЕНИЕ: Правильно обрабатываем изображение
          let imageSource;
          try {
            // Используем ту же функцию, что и в main-menu.js
            imageSource = getProductImage(product.id, product.image);
            console.log(`📸 Image source: ${imageSource}`);
          } catch (error) {
            console.log('⚠️ Не удалось загрузить фото, используем заглушку');
            imageSource = './assets/product_default.jpg';
          }

          // 🔥 ИСПРАВЛЕНИЕ: Правильно отправляем фото
          // Если imageSource это URL - используем как строку, если локальный файл - как объект
          if (imageSource.startsWith('http')) {
            await ctx.replyWithPhoto(imageSource, {
              caption: message,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            });
          } else {
            await ctx.replyWithPhoto(
              { source: imageSource },
              {
                caption: message,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
              }
            );
          }
          
          console.log(`✅ Product card sent for: ${product.name}`);
          return; // Важно: завершаем выполнение здесь
          
        } else {
          console.log(`❌ Product not found with ID: ${productId}`);
          await ctx.reply('❌ Товар не найден. Возможно, он был удален или перемещен.');
          // Продолжаем показ главного меню
        }
      }
      
      // Если нет параметра или товар не найден - показываем главное меню
      console.log('📋 Showing main menu');
      const categories = await getCategories();
      
      // Отправляем фото витрины
      await ctx.replyWithPhoto({
        source: './assets/vitrina.jpg'
      }, {
        caption: '<b>👑 Добро пожаловать в каталог!\nВыберите категорию:</b>',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buildMainMenu(categories)
        }
      });
      
    } catch (error) {
      console.error('❌ Error in start handler:', error);
      await ctx.reply('⚠️ Произошла ошибка. Попробуйте позже.');
    }
  });
}

module.exports = { handleStart };