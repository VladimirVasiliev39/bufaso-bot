const { google } = require('googleapis');

// 🔧 АУТЕНТИФИКАЦИЯ ДЛЯ RENDER
function getAuth() {
  console.log('🔐 Инициализация аутентификации Google Sheets...');
  
  // Проверяем наличие обязательных переменных
  if (!process.env.GOOGLE_PRIVATE_KEY) {
    console.error('❌ GOOGLE_PRIVATE_KEY не найден в переменных окружения');
    throw new Error('GOOGLE_PRIVATE_KEY is required');
  }
  
  if (!process.env.GOOGLE_CLIENT_EMAIL) {
    console.error('❌ GOOGLE_CLIENT_EMAIL не найден в переменных окружения');
    throw new Error('GOOGLE_CLIENT_EMAIL is required');
  }

  const SPREADSHEET_ID = process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;
  if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID не найден в переменных окружения');
    throw new Error('SPREADSHEET_ID is required');
  }

  console.log('✅ Переменные окружения найдены');
  
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    console.log('✅ Аутентификация JWT создана');
    return auth;
  } catch (error) {
    console.error('💥 Ошибка создания аутентификации:', error);
    throw error;
  }
}

// Инициализация глобальных переменных
let auth;
let sheets;
let SPREADSHEET_ID;

try {
  auth = getAuth();
  sheets = google.sheets({ version: 'v4', auth });
  SPREADSHEET_ID = process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;
  console.log('✅ Google Sheets клиент инициализирован, SPREADSHEET_ID:', SPREADSHEET_ID);
} catch (error) {
  console.error('💥 Критическая ошибка инициализации Google Sheets:', error);
}

// Функция проверки прав администратора
function isAdmin(ctx) {
  const adminIds = process.env.ADMIN_IDS ? 
    process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];
  return adminIds.includes(ctx.from.id);
}

// Функция с таймаутом
function withTimeout(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Генерация номера заказа
function generateOrderId(lastOrderId) {
  if (!lastOrderId) return '001';
  const nextNum = parseInt(lastOrderId) + 1;
  return nextNum.toString().padStart(3, '0');
}

// Получение последнего номера заказа
async function getLastOrderId() {
  try {
    console.log('🔍 Получение последнего OrderID...');
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A2:A',
    }));

    const orders = response.data.values || [];
    console.log(`📋 Найдено заказов в таблице: ${orders.length}`);
    
    if (orders.length === 0) {
      console.log('📭 Таблица заказов пуста, начинаем с 001');
      return null;
    }
    
    const orderNumbers = orders.map(row => parseInt(row[0])).filter(num => !isNaN(num));
    if (orderNumbers.length === 0) {
      console.log('❌ Не найдено валидных номеров заказов');
      return null;
    }
    
    const lastId = Math.max(...orderNumbers).toString();
    console.log(`✅ Последний OrderID: ${lastId}`);
    return lastId;
    
  } catch (error) {
    console.error('💥 Ошибка получения последнего OrderID:', error);
    return null;
  }
}

// Функция уведомления клиента
async function notifyCustomer(orderId, status, userChatId, bot) {
  try {
    console.log(`🔔 Уведомление клиента ${userChatId} о заказе ${orderId}`);
    
    if (!userChatId || isNaN(userChatId) || userChatId.toString().length < 5) {
      console.log('❌ Неверный userChatId для уведомления');
      return;
    }
    
    const statusMessages = {
      'accepted': '✅ Принят администратором',
      'preparing': '✅ Передан на комплектацию', 
      'in_delivery': '✅ Отправлен адресату',
      'cancelled': '❌ Отменён администратором',
      'completed': '♥️ Доставлен и завершён !'
    };
    
    if (statusMessages[status]) {
      const message = `📦 Статус вашего заказа #${orderId}:\n${statusMessages[status]}`;
      await bot.telegram.sendMessage(userChatId, message);
      console.log(`✅ Уведомление отправлено клиенту ${userChatId}`);
    } else {
      console.log(`❌ Неизвестный статус для уведомления: ${status}`);
    }
    
  } catch (error) {
    console.error('💥 Ошибка уведомления клиента:', error);
  }
}

// Функция получения данных заказа
async function getOrderData(orderId) {
  try {
    console.log(`🔍 Получение данных заказа ${orderId}...`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
    }));

    const orders = response.data.values || [];
    console.log(`📋 Всего заказов в таблице: ${orders.length}`);
    
    const order = orders.find(row => row[0] === orderId);
    
    if (order) {
      console.log(`✅ Заказ ${orderId} найден`);
      
      let userChatId = null;
      const userChatIdValue = order[10];
      
      if (userChatIdValue && userChatIdValue !== '' && !isNaN(parseInt(userChatIdValue))) {
        const parsed = parseInt(userChatIdValue);
        if (parsed.toString().length >= 5) {
          userChatId = parsed;
        }
      }
      
      const orderData = {
        orderId: order[0],
        date: order[1],
        time: order[2],
        status: order[3],
        customerName: order[4],
        phone: order[5],
        address: order[6],
        total: order[7],
        notes: order[8],
        userInfo: order[9],
        userChatId: userChatId
      };
      
      console.log(`📊 Данные заказа:`, orderData);
      return orderData;
    }
    
    console.log(`❌ Заказ ${orderId} не найден`);
    return null;
    
  } catch (error) {
    console.error(`💥 Ошибка получения данных заказа ${orderId}:`, error);
    return null;
  }
}

// Создание заказа
async function createOrder(orderData) {
  console.log('🎯 Начало создания заказа:', JSON.stringify(orderData, null, 2));
  
  try {
    // Проверяем обязательные поля
    if (!orderData.name && !orderData.customer) {
      throw new Error('Не указано имя клиента');
    }
    if (!orderData.phone) {
      throw new Error('Не указан телефон');
    }
    if (!orderData.address) {
      throw new Error('Не указан адрес');
    }
    if (!orderData.items || orderData.items.length === 0) {
      throw new Error('Корзина пуста');
    }

    const lastOrderId = await getLastOrderId();
    const orderId = generateOrderId(lastOrderId);
    
    console.log(`🆔 Сгенерирован OrderID: ${orderId}`);

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    
    console.log('📅 Дата и время заказа:', date, time);

    // Расчет товаров и суммы
    const itemsWithSubtotal = (orderData.items || []).map(item => {
      const subtotal = (item.price || 0) * (item.quantity || 0);
      console.log(`📦 Товар: ${item.productName} × ${item.quantity} = ${subtotal}р`);
      return {
        ...item,
        subtotal: subtotal
      };
    });

    const calculatedTotal = itemsWithSubtotal.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    console.log(`💰 Общая сумма заказа: ${calculatedTotal}р`);

    // Подготавливаем данные пользователя
    const userInfo = orderData.userInfo || 
                    orderData.telegramUsername || 
                    (orderData.userId ? `ID: ${orderData.userId}` : 'Не указан');

    const userChatId = orderData.userChatId ? orderData.userChatId.toString() : '';

    // Данные для строки заказа
    const orderRow = [
      orderId,
      date,
      time,
      'new',
      orderData.customer || orderData.name,
      orderData.phone,
      orderData.address,
      calculatedTotal,
      orderData.notes || '',
      userInfo,
      userChatId
    ];

    console.log('📝 Данные для ORDERS:', orderRow);

    // Записываем в таблицу ORDERS
    console.log('💾 Запись в ORDERS...');
    const orderResponse = await withTimeout(sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
      valueInputOption: 'RAW',
      resource: { values: [orderRow] }
    }));

    console.log('✅ Запись в ORDERS успешна');

    // Записываем товары в ORDER_ITEMS
    const itemRows = itemsWithSubtotal.map(item => [
      orderId,
      item.productId || '',
      item.productName || '',
      item.price || 0,
      item.quantity || 0,
      item.subtotal || 0
    ]);

    console.log(`📦 Записываем ${itemRows.length} товаров в ORDER_ITEMS...`);

    if (itemRows.length > 0) {
      await withTimeout(sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ORDER_ITEMS!A:F',
        valueInputOption: 'RAW',
        resource: { values: itemRows }
      }));
      console.log('✅ Запись в ORDER_ITEMS успешна');
    }

    console.log(`🎉 Заказ #${orderId} успешно создан!`);
    return orderId;

  } catch (error) {
    console.error('💥 Критическая ошибка создания заказа:', error);
    throw error;
  }
}

// Обновление статуса с записью в таблицу
async function updateOrderStatus(orderId, newStatus, adminNotes = '', adminName = 'Система') {
  try {
    console.log(`🔄 Обновление статуса заказа ${orderId} на "${newStatus}"`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
    }));

    const orders = response.data.values || [];
    const orderRowIndex = orders.findIndex(row => row[0] === orderId);
    
    if (orderRowIndex !== -1) {
      const actualRowIndex = orderRowIndex + 1; // +1 потому что в Sheets строки с 1
      const now = new Date();
      const timestamp = now.toLocaleString('ru-RU');
      
      console.log(`📝 Обновляем строку ${actualRowIndex} в ORDERS`);

      // Обновляем статус в основной таблице
      await withTimeout(sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `ORDERS!D${actualRowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[newStatus]]
        }
      }));

      // Записываем историю статусов в колонку Notes (I)
      const statusHistory = `[${timestamp}] ${adminName}: ${newStatus}${adminNotes ? ` (${adminNotes})` : ''}`;
      
      await withTimeout(sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `ORDERS!I${actualRowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[statusHistory]]
        }
      }));
      
      console.log(`✅ Статус заказа ${orderId} обновлен на "${newStatus}"`);
      return true;
    }
    
    console.log(`❌ Заказ ${orderId} не найден для обновления статуса`);
    return false;
    
  } catch (error) {
    console.error(`💥 Ошибка обновления статуса заказа ${orderId}:`, error);
    throw error;
  }
}

// Отправка уведомления админу
async function notifyAdmin(orderId, orderData, bot) {
  try {
    console.log(`🔔 Отправка уведомления админу о заказе ${orderId}`);
    
    const adminChatId = process.env.ADMIN_CHAT_ID_CHANEL || process.env.ADMIN_CHAT_ID;
    
    if (!adminChatId) {
      console.error('❌ ADMIN_CHAT_ID не установлен');
      return;
    }

    console.log(`👤 Admin Chat ID: ${adminChatId}`);

    let itemsText = '';
    const items = orderData.items || [];
    
    items.forEach(item => {
      const itemSubtotal = (item.price || 0) * (item.quantity || 0);
      itemsText += `• ${item.productName} ×${item.quantity} = ${itemSubtotal}р\n`;
    });

    const calculatedTotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
    const userInfo = orderData.userInfo || orderData.telegramUsername || `ID: ${orderData.userId || 'Неизвестен'}`;

    const actionKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Принять', callback_data: `order_accept_${orderId}` },
          { text: '📞 Позвонить', callback_data: `order_call_${orderId}` }
        ],
        [
          { text: '👨‍🍳 На сборку', callback_data: `order_prepare_${orderId}` },
          { text: '🚗 В доставку', callback_data: `order_delivery_${orderId}` }
        ],
        [
          { text: '❌ Отменить', callback_data: `order_cancel_${orderId}` }
        ]
      ]
    };

    const message = `
🆕 НОВЫЙ ЗАКАЗ #${orderId}
👤 ${orderData.customer || orderData.name}
📞 ${orderData.phone}  
🏠 ${orderData.address}
👨‍💻 TG: ${userInfo}
💰 ${calculatedTotal}р | 🕒 ${new Date().toLocaleTimeString()}

📦 Состав:
${itemsText}
───────
Итого: ${calculatedTotal}р
    `.trim();
    
    console.log(`💬 Отправляем сообщение админу:`, message);
    
    await bot.telegram.sendMessage(adminChatId, message, {
      reply_markup: actionKeyboard
    });

    console.log('✅ Уведомление админу отправлено');
    
  } catch (error) {
    console.error('💥 Ошибка отправки уведомления админу:', error);
  }
}

// Настройка обработчиков кнопок для заказов
function setupOrderHandlers(bot) {
  console.log('⚙️ Настройка обработчиков заказов...');
  
  // Получаем имя админа для записи
  function getAdminName(ctx) {
    return ctx.from.first_name || ctx.from.username || `ID:${ctx.from.id}`;
  }

  bot.action(/order_accept_(.+)/, async (ctx) => {
    try {
      console.log(`🔄 Обработка принятия заказа: ${ctx.match[1]}`);
      
      // Проверка прав администратора
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('❌ Нет прав администратора');
        return;
      }

      const orderId = ctx.match[1];
      const adminName = getAdminName(ctx);
      
      // Проверяем текущий статус
      const orderData = await getOrderData(orderId);
      if (!orderData) {
        await ctx.answerCbQuery('❌ Заказ не найден');
        return;
      }
      
      if (orderData.status !== 'new') {
        await ctx.answerCbQuery('⚠️ Статус уже изменен');
        return;
      }

      await updateOrderStatus(orderId, 'accepted', 'Принят администратором', adminName);
      
      if (orderData.userChatId) {
        await notifyCustomer(orderId, 'accepted', orderData.userChatId, bot);
      }
      
      // Обновляем сообщение полностью
      const originalMessage = ctx.update.callback_query.message.text;
      const updatedMessage = originalMessage.replace('🆕 НОВЫЙ ЗАКАЗ', '✅ ПРИНЯТЫЙ ЗАКАЗ')
                                           .replace('👨‍🍳 ЗАКАЗ ГОТОВИТСЯ', '✅ ПРИНЯТЫЙ ЗАКАЗ')
                                           .replace('🚗 ЗАКАЗ В ДОСТАВКЕ', '✅ ПРИНЯТЫЙ ЗАКАЗ');
      
      await ctx.editMessageText(updatedMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ ПРИНЯТО', callback_data: 'accepted' },
              { text: '👨‍🍳 На сборку', callback_data: `order_prepare_${orderId}` }
            ]
          ]
        }
      });
      
      await ctx.answerCbQuery('✅ Заказ принят');
      
    } catch (error) {
      console.error('Accept order error:', error);
      await ctx.answerCbQuery('❌ Ошибка принятия заказа');
    }
  });

  bot.action(/order_call_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('📞 Используйте номер из заказа для звонка');
  });

  bot.action(/order_prepare_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('❌ Нет прав администратора');
        return;
      }

      const orderId = ctx.match[1];
      const adminName = getAdminName(ctx);
      
      const orderData = await getOrderData(orderId);
      if (!orderData) {
        await ctx.answerCbQuery('❌ Заказ не найден');
        return;
      }
      
      await updateOrderStatus(orderId, 'preparing', 'Передан на сборку', adminName);
      
      if (orderData.userChatId) {
        await notifyCustomer(orderId, 'preparing', orderData.userChatId, bot);
      }
      
      const originalMessage = ctx.update.callback_query.message.text;
      const updatedMessage = originalMessage.replace('🆕 НОВЫЙ ЗАКАЗ', '👨‍🍳 ЗАКАЗ ГОТОВИТСЯ')
                                           .replace('✅ ПРИНЯТЫЙ ЗАКАЗ', '👨‍🍳 ЗАКАЗ ГОТОВИТСЯ')
                                           .replace('🚗 ЗАКАЗ В ДОСТАВКЕ', '👨‍🍳 ЗАКАЗ ГОТОВИТСЯ');
      
      await ctx.editMessageText(updatedMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👨‍🍳 ГОТОВИТСЯ', callback_data: 'preparing' },
              { text: '🚗 В доставку', callback_data: `order_delivery_${orderId}` }
            ]
          ]
        }
      });
      
      await ctx.answerCbQuery('👨‍🍳 Заказ готовится');
      
    } catch (error) {
      console.error('Prepare order error:', error);
      await ctx.answerCbQuery('❌ Ошибка');
    }
  });

  bot.action(/order_delivery_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('❌ Нет прав администратора');
        return;
      }

      const orderId = ctx.match[1];
      const adminName = getAdminName(ctx);
      
      const orderData = await getOrderData(orderId);
      if (!orderData) {
        await ctx.answerCbQuery('❌ Заказ не найден');
        return;
      }
      
      await updateOrderStatus(orderId, 'in_delivery', 'Передан курьеру', adminName);
      
      if (orderData.userChatId) {
        await notifyCustomer(orderId, 'in_delivery', orderData.userChatId, bot);
      }
      
      const originalMessage = ctx.update.callback_query.message.text;
      const updatedMessage = originalMessage
        .replace('🆕 НОВЫЙ ЗАКАЗ', '🚗 ЗАКАЗ В ДОСТАВКЕ')
        .replace('✅ ПРИНЯТЫЙ ЗАКАЗ', '🚗 ЗАКАЗ В ДОСТАВКЕ')
        .replace('👨‍🍳 ЗАКАЗ ГОТОВИТСЯ', '🚗 ЗАКАЗ В ДОСТАВКЕ');
      
      await ctx.editMessageText(updatedMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚗 В ДОСТАВКЕ', callback_data: 'delivering' },
              { text: '✅ Завершить', callback_data: `order_complete_${orderId}` }
            ]
          ]
        }
      });
      
      await ctx.answerCbQuery('🚗 Заказ в доставке');
      
    } catch (error) {
      console.error('Delivery order error:', error);
      await ctx.answerCbQuery('❌ Ошибка');
    }
  });

  bot.action(/order_cancel_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('❌ Нет прав администратора');
        return;
      }

      const orderId = ctx.match[1];
      const adminName = getAdminName(ctx);
      
      await updateOrderStatus(orderId, 'cancelled', 'Отменен администратором', adminName);
      
      const orderData = await getOrderData(orderId);
      if (orderData && orderData.userChatId) {
        await notifyCustomer(orderId, 'cancelled', orderData.userChatId, bot);
      }
      
      const originalMessage = ctx.update.callback_query.message.text;
      const updatedMessage = originalMessage
        .replace('🆕 НОВЫЙ ЗАКАЗ', '❌ ЗАКАЗ ОТМЕНЕН')
        .replace('✅ ПРИНЯТЫЙ ЗАКАЗ', '❌ ЗАКАЗ ОТМЕНЕН')
        .replace('👨‍🍳 ЗАКАЗ ГОТОВИТСЯ', '❌ ЗАКАЗ ОТМЕНЕН')
        .replace('🚗 ЗАКАЗ В ДОСТАВКЕ', '❌ ЗАКАЗ ОТМЕНЕН');
      
      await ctx.editMessageText(updatedMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌ ОТМЕНЕНО', callback_data: 'cancelled' }
            ]
          ]
        }
      });
      
      await ctx.answerCbQuery('❌ Заказ отменен');
      
    } catch (error) {
      console.error('Cancel order error:', error);
      await ctx.answerCbQuery('❌ Ошибка отмены');
    }
  });

  bot.action(/order_complete_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('❌ Нет прав администратора');
        return;
      }

      const orderId = ctx.match[1];
      const adminName = getAdminName(ctx);
      
      await updateOrderStatus(orderId, 'completed', 'Заказ завершен', adminName);
      
      const orderData = await getOrderData(orderId);
      if (orderData && orderData.userChatId) {
        await notifyCustomer(orderId, 'completed', orderData.userChatId, bot);
      }
      
      const originalMessage = ctx.update.callback_query.message.text;
      const updatedMessage = originalMessage
        .replace('🆕 НОВЫЙ ЗАКАЗ', '✅ ЗАКАЗ ЗАВЕРШЕН')
        .replace('✅ ПРИНЯТЫЙ ЗАКАЗ', '✅ ЗАКАЗ ЗАВЕРШЕН')
        .replace('👨‍🍳 ЗАКАЗ ГОТОВИТСЯ', '✅ ЗАКАЗ ЗАВЕРШЕН')
        .replace('🚗 ЗАКАЗ В ДОСТАВКЕ', '✅ ЗАКАЗ ЗАВЕРШЕН');
      
      await ctx.editMessageText(updatedMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ ЗАВЕРШЕНО', callback_data: 'completed' }
            ]
          ]
        }
      });
      
      await ctx.answerCbQuery('✅ Заказ завершен');
      
    } catch (error) {
      console.error('Complete order error:', error);
      await ctx.answerCbQuery('❌ Ошибка завершения');
    }
  });

  console.log('✅ Обработчики заказов настроены');
}

// Тестовая функция для проверки подключения
async function testConnection() {
  try {
    console.log('🧪 Тестирование подключения к Google Sheets...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Categories!A:B',
    });
    
    console.log(`✅ Подключение работает! Найдено категорий: ${response.data.values?.length || 0}`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка тестирования подключения:', error);
    return false;
  }
}

module.exports = { 
  createOrder, 
  notifyAdmin, 
  updateOrderStatus,
  setupOrderHandlers,
  notifyCustomer,
  getOrderData,
  isAdmin,
  testConnection
};