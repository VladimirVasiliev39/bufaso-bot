const { google } = require('googleapis');

// 🔧 ИСПРАВЛЕННАЯ АУТЕНТИФИКАЦИЯ ДЛЯ RENDER
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
  console.log('✅ Google Sheets клиент инициализирован');
} catch (error) {
  console.error('💥 Критическая ошибка инициализации Google Sheets:', error);
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

// Получение категорий из таблицы
async function getCategories() {
  try {
    console.log('📊 Загрузка категорий...');
    console.log('📋 SPREADSHEET_ID:', SPREADSHEET_ID);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Categories!A2:B',
    }), 15000);
    
    const categories = response.data.values || [];
    
    console.log('✅ Загружено категорий:', categories.length);
    return categories;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки категорий:', error.message);
    return [];
  }
}

// Получение товаров по категории
async function getProductsByCategory(categoryId) {
  try {
    console.log(`📦 Загрузка товаров для категории ${categoryId}...`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:F',
    }), 15000);
    
    const products = response.data.values || [];
    const filteredProducts = products.filter(product => product[1] === categoryId);
    
    console.log(`✅ Для категории ${categoryId} найдено товаров:`, filteredProducts.length);
    return filteredProducts;
    
  } catch (error) {
    console.error(`❌ Ошибка загрузки товаров для категории ${categoryId}:`, error.message);
    return [];
  }
}

// Получение товара по ID
async function getProductById(productId) {
  try {
    console.log(`🔍 Поиск товара по ID: ${productId}`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:F',
    }), 15000);
    
    const products = response.data.values || [];
    const product = products.find(p => p[0] === productId);
    
    if (product) {
      console.log(`✅ Товар найден:`, product[2]);
      return {
        id: product[0],
        categoryId: product[1],
        name: product[2],
        price: product[3],
        description: product[4] || 'Описание отсутствует',
        image: product[5] || 'product_default.jpg'
      };
    }
    
    console.log('❌ Товар с ID', productId, 'не найден');
    return null;
    
  } catch (error) {
    console.error('❌ Ошибка поиска товара по ID:', error.message);
    return null;
  }
}

// Функция для получения названия категории по ID
async function getCategoryName(categoryId) {
  try {
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Categories!A2:B',
    }), 15000);
    
    const categories = response.data.values || [];
    const category = categories.find(cat => cat[0] === categoryId);
    
    return category ? category[1] : `Категория ${categoryId}`;
    
  } catch (error) {
    console.error('❌ Ошибка получения названия категории:', error.message);
    return `Категория ${categoryId}`;
  }
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
  getCategories, 
  getProductsByCategory, 
  getProductById, 
  getCategoryName,
  testConnection
};