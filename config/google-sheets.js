const { google } = require('googleapis');

// 🔥 ОБНОВЛЕННЫЙ КОД ДЛЯ RAILWAY И ЛОКАЛЬНОЙ РАЗРАБОТКИ
function getAuth() {
  if (process.env.GOOGLE_CREDENTIALS) {
    // Для Railway - из переменной окружения
    console.log('🔧 Использую credentials из переменных окружения');
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    return new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // Для локальной разработки - из файла
    console.log('🔧 Использую credentials из файла');
    return new google.auth.GoogleAuth({
      keyFile: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
}

const auth = getAuth();
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

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

// 🔥 НОВАЯ функция для получения названия категории по ID
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

module.exports = { 
  getCategories, 
  getProductsByCategory, 
  getProductById, 
  getCategoryName
};