const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: './credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// Функция проверки прав администратора
function isAdmin(ctx) {
  const adminIds = process.env.ADMIN_IDS ? 
    process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];
  return adminIds.includes(ctx.from.id);
}

// Функция с таймаутом
function withTimeout(promise, timeoutMs = 8000) {
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
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A2:A',
    }));

    const orders = response.data.values || [];
    if (orders.length === 0) return null;
    
    const orderNumbers = orders.map(row => parseInt(row[0])).filter(num => !isNaN(num));
    if (orderNumbers.length === 0) return null;
    
    return Math.max(...orderNumbers).toString();
  } catch (error) {
    return null;
  }
}

// Функция уведомления клиента
async function notifyCustomer(orderId, status, userChatId, bot) {
  try {
    if (!userChatId || isNaN(userChatId) || userChatId.toString().length < 5) {
      return;
    }
    
    const statusMessages = {
      'accepted': '✅ принят администратором',
      'preparing': '👨‍🍳 передан на кухню и готовится', 
      'in_delivery': '🚗 отправлен с курьером',
      'cancelled': '❌ отменён администратором',
      'completed': '🎉 доставлен и завершён'
    };
    
    if (statusMessages[status]) {
      const message = `📦 Статус вашего заказа #${orderId}:\n${statusMessages[status]}`;
      await bot.telegram.sendMessage(userChatId, message);
    }
    
  } catch (error) {
    // Тихий fail - не спамим в консоль
  }
}

// Функция получения данных заказа
async function getOrderData(orderId) {
  try {
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
    }));

    const orders = response.data.values || [];
    const order = orders.find(row => row[0] === orderId);
    
    if (order) {
      let userChatId = null;
      const userChatIdValue = order[10];
      
      if (userChatIdValue && userChatIdValue !== '' && !isNaN(parseInt(userChatIdValue))) {
        const parsed = parseInt(userChatIdValue);
        if (parsed.toString().length >= 5) {
          userChatId = parsed;
        }
      }
      
      return {
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
    }
    
    return null;
    
  } catch (error) {
    return null;
  }
}

// Создание заказа
async function createOrder(orderData) {
  try {
    const lastOrderId = await getLastOrderId();
    const orderId = generateOrderId(lastOrderId);
    
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    
    const itemsWithSubtotal = (orderData.items || []).map(item => ({
      ...item,
      subtotal: (item.price || 0) * (item.quantity || 0)
    }));

    const calculatedTotal = itemsWithSubtotal.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    const userInfo = orderData.telegramUsername || 
                    (orderData.userId ? `ID: ${orderData.userId}` : 'Не указан');

    const userChatId = orderData.userChatId ? orderData.userChatId.toString() : '';

    const orderRow = [
      orderId,
      date,
      time,
      'new',
      orderData.name || '',
      orderData.phone || '',
      orderData.address || '',
      calculatedTotal,
      '',
      userInfo,
      userChatId
    ];

    await withTimeout(sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
      valueInputOption: 'RAW',
      resource: {
        values: [orderRow]
      }
    }));

    // Пакетная запись items для скорости
    const itemRows = itemsWithSubtotal.map(item => [
      orderId,
      item.productId || '',
      item.productName || '',
      item.price || 0,
      item.quantity || 0,
      item.subtotal || 0
    ]);

    if (itemRows.length > 0) {
      await withTimeout(sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ORDER_ITEMS!A:F',
        valueInputOption: 'RAW',
        resource: {
          values: itemRows
        }
      }));
    }

    return orderId;

  } catch (error) {
    throw error;
  }
}

// Обновление статуса с записью в таблицу
async function updateOrderStatus(orderId, newStatus, adminNotes = '', adminName = 'Система') {
  try {
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ORDERS!A:K',
    }));

    const orders = response.data.values || [];
    const orderRowIndex = orders.findIndex(row => row[0] === orderId);
    
    if (orderRowIndex !== -1) {
      const actualRowIndex = orderRowIndex + 1;
      const now = new Date();
      const timestamp = now.toLocaleString('ru-RU');
      
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
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    throw error;
  }
}

// Отправка уведомления админу
async function notifyAdmin(orderId, orderData, bot) {
  try {
    const adminChatId = process.env.ADMIN_CHAT_ID_CHANEL || process.env.ADMIN_CHAT_ID;
    
    if (!adminChatId) return;

    let itemsText = '';
    const items = orderData.items || [];
    
    items.forEach(item => {
      const itemSubtotal = (item.price || 0) * (item.quantity || 0);
      itemsText += `• ${item.productName} ×${item.quantity} = ${itemSubtotal}р\n`;
    });

    const calculatedTotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
    const userInfo = orderData.telegramUsername || `ID: ${orderData.userId || 'Неизвестен'}`;

    const actionKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Принять', callback_data: `order_accept_${orderId}` },
          { text: '📞 Позвонить', callback_data: `order_call_${orderId}` }
        ],
        [
          { text: '👨‍🍳 В готовку', callback_data: `order_prepare_${orderId}` },
          { text: '🚗 В доставку', callback_data: `order_delivery_${orderId}` }
        ],
        [
          { text: '❌ Отменить', callback_data: `order_cancel_${orderId}` }
        ]
      ]
    };

    const message = `
🆕 НОВЫЙ ЗАКАЗ #${orderId}
👤 ${orderData.name}
📞 ${orderData.phone}  
🏠 ${orderData.address}
👨‍💻 TG: ${userInfo}
💰 ${calculatedTotal}р | 🕒 ${new Date().toLocaleTimeString()}

📦 Состав:
${itemsText}
───────
Итого: ${calculatedTotal}р
    `.trim();
    
    await bot.telegram.sendMessage(adminChatId, message, {
      reply_markup: actionKeyboard
    });

  } catch (error) {
    // Тихий fail
  }
}

// Настройка обработчиков кнопок для заказов
function setupOrderHandlers(bot) {
  
  // Получаем имя админа для записи
  function getAdminName(ctx) {
    return ctx.from.first_name || ctx.from.username || `ID:${ctx.from.id}`;
  }

  bot.action(/order_accept_(.+)/, async (ctx) => {
    try {
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
              { text: '👨‍🍳 В готовку', callback_data: `order_prepare_${orderId}` }
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
      
      await updateOrderStatus(orderId, 'preparing', 'Передан на кухню', adminName);
      
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
      await ctx.answerCbQuery('❌ Ошибка завершения');
    }
  });
}

module.exports = { 
  createOrder, 
  notifyAdmin, 
  updateOrderStatus,
  setupOrderHandlers,
  notifyCustomer,
  getOrderData,
  isAdmin
};