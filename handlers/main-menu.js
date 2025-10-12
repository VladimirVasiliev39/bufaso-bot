const { getCategories, getProductsByCategory, getProductById, getCategoryName } = require('../config/google-sheets');
const { buildMainMenu, buildProductsKeyboard } = require('../utils/keyboard-builder');
const { addToCart, formatCartMessage, getCartItemsCount, getCartTotal, formatMiniCart } = require('../utils/cart-manager');
const { getProductImage } = require('../utils/image-handler');
const { createOrder, notifyAdmin } = require('../utils/order-manager');

// 🔥 Отслеживаем первый запуск для каждого пользователя
const userFirstLaunch = new Set();

function handleMainMenu(bot) {
  // ========== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ==========
  bot.on('text', async (ctx) => {
    try {
      if (!ctx.session.checkoutStep) return;

      const text = ctx.message.text.trim();
      
      switch (ctx.session.checkoutStep) {
        case 'waiting_name':
          ctx.session.checkoutData = {
            name: text,
            items: ctx.session.cart ? [...ctx.session.cart] : [],
            total: getCartTotal(ctx.session.cart || [])
          };
          
          ctx.session.checkoutStep = 'waiting_phone';
          await ctx.reply(`📞 Отлично, ${text}! Теперь укажите ваш телефон для связи:`);
          break;
          
        case 'waiting_phone':
          ctx.session.checkoutData.phone = text;
          ctx.session.checkoutStep = 'waiting_address';
          await ctx.reply('🏠 Теперь укажите адрес доставки:');
          break;
          
        case 'waiting_address':
          ctx.session.checkoutData.address = text;
          
          ctx.session.checkoutData.telegramUsername = ctx.from.username ? 
            `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
          ctx.session.checkoutData.userId = ctx.from.id;
          
          // 🔥 ПРАВИЛЬНОЕ СОХРАНЕНИЕ userChatId
          const userChatId = ctx.from.id;
          console.log('🔍 Сохраняем userChatId:', userChatId, 'тип:', typeof userChatId);
          ctx.session.checkoutData.userChatId = userChatId;
          
          const orderId = await createOrder(ctx.session.checkoutData);
          await notifyAdmin(orderId, ctx.session.checkoutData, bot);
          
          ctx.session.cart = [];
          delete ctx.session.checkoutStep;
          delete ctx.session.checkoutData;
          
          await ctx.reply(`🎉 Заказ #${orderId} успешно оформлен!\n\nОжидайте звонка для подтверждения. Спасибо за заказ!`);
          
          const categories = await getCategories();
          const keyboard = buildMainMenu(categories, 0);
          
          await ctx.replyWithPhoto(
            { source: './assets/vitrina.jpg' },
            {
              caption: '🍕 Меню',
              reply_markup: { inline_keyboard: keyboard }
            }
          );
          break;
      }
      
    } catch (error) {
      await ctx.reply('⚠️ Произошла ошибка при оформлении заказа. Попробуйте позже.');
      delete ctx.session.checkoutStep;
      delete ctx.session.checkoutData;
    }
  });

  // ========== ОБРАБОТЧИКИ ==========
  
  // 🔥 Главное меню (категории)
  bot.action('back_to_categories', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const categories = await getCategories();
      const cartCount = getCartItemsCount(ctx.session.cart || []);
      const keyboard = buildMainMenu(categories, cartCount);
      
      const userId = ctx.from.id;
      let caption = '🍕 Меню';
      
      if (!userFirstLaunch.has(userId)) {
        caption = '🍕 Добро пожаловать в BuFaso!\nВыберите категорию:';
        userFirstLaunch.add(userId);
      }
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: caption
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Выбор категории
  bot.action(/category_(.+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const categoryId = ctx.match[1];
      const products = await getProductsByCategory(categoryId);
      
      if (products.length === 0) {
        await ctx.answerCbQuery('😔 Нет товаров');
        return;
      }
      
      const categoryName = await getCategoryName(categoryId);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}`
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Карточка товара (ЧИСТЫЙ интерфейс)
  bot.action(/product_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      
      const product = await getProductById(productId);
      
      if (!product) {
        await ctx.answerCbQuery('❌ Товар не найден');
        return;
      }
      
      const categoryId = product.categoryId;
      const quantity = 1;
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}` },
          { text: ` ${quantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${quantity}` }
        ],
        [
          { text: '⬅️ Назад к товарам', callback_data: `back_to_products_${categoryId}` }
        ]
      ];
      
      await ctx.editMessageMedia(
        {
          type: 'photo', 
          media: { source: getProductImage(product.id, product.image) },
          caption: `🍕 ${product.name}\n💰 ${product.price}р\n📝 ${product.description}\n\nКоличество: ${quantity}`
        },
        {
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Увеличение количества (в карточке товара)
  bot.action(/increase_(.+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const categoryId = ctx.match[2];
      
      const messageText = ctx.update.callback_query.message.caption;
      const currentMatch = messageText.match(/Количество: (\d+)/);
      let quantity = currentMatch ? parseInt(currentMatch[1]) : 1;
      
      const newQuantity = Math.min(quantity + 1, 10);
      
      if (newQuantity === quantity) {
        await ctx.answerCbQuery('❌ Максимальное количество: 10');
        return;
      }
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}` },
          { text: ` ${newQuantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${newQuantity}` }
        ],
        [
          { text: '⬅️ Назад к товарам', callback_data: `back_to_products_${categoryId}` }
        ]
      ];
      
      await ctx.editMessageCaption(
        messageText.replace(/Количество: \d+/, `Количество: ${newQuantity}`),
        {
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Уменьшение количества (в карточке товара)
  bot.action(/decrease_(.+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const categoryId = ctx.match[2];
      
      const messageText = ctx.update.callback_query.message.caption;
      const currentMatch = messageText.match(/Количество: (\d+)/);
      let quantity = currentMatch ? parseInt(currentMatch[1]) : 1;
      
      const newQuantity = Math.max(quantity - 1, 1);
      
      if (newQuantity === quantity) {
        await ctx.answerCbQuery('❌ Минимальное количество: 1');
        return;
      }
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}` },
          { text: ` ${newQuantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${newQuantity}` }
        ],
        [
          { text: '⬅️ Назад к товарам', callback_data: `back_to_products_${categoryId}` }
        ]
      ];
      
      await ctx.editMessageCaption(
        messageText.replace(/Количество: \d+/, `Количество: ${newQuantity}`),
        {
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Добавление в корзину (ВОЗВРАЩАЕМ с мини-корзиной)
  bot.action(/add_to_cart_(.+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const quantity = parseInt(ctx.match[2]);
      
      const product = await getProductById(productId);
      
      if (!product) {
        await ctx.answerCbQuery('❌ Товар не найден');
        return;
      }
      
      ctx.session.cart = addToCart(
        ctx.session.cart || [],
        product.id, 
        product.name, 
        parseInt(product.price),
        quantity
      );
      
      await ctx.answerCbQuery(`✅ ${product.name} × ${quantity} шт. добавлено в корзину!`);
      
      const products = await getProductsByCategory(product.categoryId);
      const categoryName = await getCategoryName(product.categoryId);
      const miniCart = formatMiniCart(ctx.session.cart || []);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}${miniCart}`
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка добавления в корзину');
    }
  });

  // 🔥 Возврат к товарам (с мини-корзиной если есть)
  bot.action(/back_to_products_(.+)/, async (ctx) => {
    try {
      const categoryId = ctx.match[1];
      const products = await getProductsByCategory(categoryId);
      const categoryName = await getCategoryName(categoryId);
      const miniCart = formatMiniCart(ctx.session.cart || []);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}${miniCart}`
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // 🔥 Корзина (полный интерфейс)
  bot.action('cart', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const cart = ctx.session.cart || [];
      const cartMessage = formatCartMessage(cart);
      const cartKeyboard = [];
      
      if (cart.length > 0) {
        cartKeyboard.push([
          { text: '🧹 Очистить корзину', callback_data: 'clear_cart' }
        ]);
        cartKeyboard.push([
          { text: '📦 Оформить заказ', callback_data: 'start_checkout' }
        ]);
      }
      
      cartKeyboard.push([
        { text: '⬅️ Вернуться к меню', callback_data: 'back_to_categories' }
      ]);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: cartMessage
        },
        {
          reply_markup: { inline_keyboard: cartKeyboard }
        }
      );
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка загрузки корзины');
    }
  });

  // 🔥 Очистка корзины
  bot.action('clear_cart', async (ctx) => {
    try {
      ctx.session.cart = [];
      await ctx.answerCbQuery('✅ Корзина очищена');
      
      const cartMessage = formatCartMessage([]);
      const cartKeyboard = [
        [{ text: '⬅️ Вернуться к меню', callback_data: 'back_to_categories' }]
      ];
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: cartMessage
        },
        {
          reply_markup: { inline_keyboard: cartKeyboard }
        }
      );
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка очистки корзины');
    }
  });

  // 🔥 Начало оформления заказа
  bot.action('start_checkout', async (ctx) => {
    try {
      const cart = ctx.session.cart || [];
      
      if (cart.length === 0) {
        await ctx.answerCbQuery('🛒 Корзина пуста!');
        return;
      }
      
      await ctx.answerCbQuery();
      await ctx.reply('📋 Оформление заказа\n\nКак к вам обращаться?');
      
      ctx.session.checkoutStep = 'waiting_name';
      
    } catch (error) {
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  // Просто отображаем количество
  bot.action(/display_quantity_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
  });
}

module.exports = { handleMainMenu };