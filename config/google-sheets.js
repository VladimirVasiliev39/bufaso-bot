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
  console.log('✅ Google Sheets клиент инициализирован, SPREADSHEET_ID:', SPREADSHEET_ID);
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

// 🔥 НОВАЯ ФУНКЦИЯ: Загрузка всех товаров (для кэширования)
let allProductsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60000; // 1 минута

async function loadAllProducts() {
  const now = Date.now();
  
  // Если кэш актуален, возвращаем его
  if (allProductsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return allProductsCache;
  }
  
  try {
    console.log('📦 Загрузка всех товаров из Google Sheets...');
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:O',
    }), 15000);
    
    const products = response.data.values || [];
    console.log(`✅ Загружено товаров: ${products.length}`);
    
    // Сохраняем в кэш
    allProductsCache = products;
    cacheTimestamp = now;
    
    return products;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки всех товаров:', error.message);
    
    // Если есть старый кэш, возвращаем его
    if (allProductsCache) {
      console.log('⚠️ Используем кэшированные данные');
      return allProductsCache;
    }
    
    return [];
  }
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
    
    const products = await loadAllProducts();
    const filteredProducts = products.filter(product => product[1] === categoryId);
    
    console.log(`✅ Для категории ${categoryId} найдено товаров:`, filteredProducts.length);
    return filteredProducts;
    
  } catch (error) {
    console.error(`❌ Ошибка загрузки товаров для категории ${categoryId}:`, error.message);
    return [];
  }
}

// 🔥 ИСПРАВЛЕННАЯ ФУНКЦИЯ: Получение вариантов цен
function getPriceVariants(product) {
  const variants = [];
  
  // Основная цена (всегда добавляем, если есть)
  if (product.price && product.price > 0) {
    variants.push({
      price: product.price,
      ed_izm: product.ed_izm || 'шт',
      isMain: true,
      variantId: 'main'
    });
  }
  
  // Дополнительные варианты цен
  const variantPairs = [
    { price: product.cena1, ed_izm: product.ed_izm1, suffix: 'variant_1' },
    { price: product.cena2, ed_izm: product.ed_izm2, suffix: 'variant_2' },
    { price: product.cena3, ed_izm: product.ed_izm3, suffix: 'variant_3' },
    { price: product.cena4, ed_izm: product.ed_izm4, suffix: 'variant_4' }
  ];
  
  variantPairs.forEach(pair => {
    if (pair.price && pair.price > 0 && pair.ed_izm && pair.ed_izm.trim() !== '') {
      variants.push({
        price: pair.price,
        ed_izm: pair.ed_izm,
        variantId: pair.suffix
      });
    }
  });
  
  console.log(`📊 Для товара "${product.name}" найдено вариантов: ${variants.length}`);
  
  return variants;
}

// 🔥 ИСПРАВЛЕННАЯ ФУНКЦИЯ: Поиск товара по ID
async function getProductById(productId) {
  try {
    console.log(`🔍 DEBUG getProductById: поиск ID="${productId}", тип=${typeof productId}`);
    
    // 🔥 ДОБАВЛЕНА ПРОВЕРКА НА НЕПРАВИЛЬНЫЕ ID
    if (typeof productId === 'string' && productId.includes('variant_') && productId.includes('_1_')) {
      console.log(`🚨 ВНИМАНИЕ! Получен неправильный ID: ${productId}`);
      console.log(`🚨 Это похоже на callback_data, а не на ID товара!`);
      return null;
    }
    
    const products = await loadAllProducts();
    const productRow = products.find(row => row[0] == productId);
    
    if (!productRow) {
      console.log(`❌ Товар с ID ${productId} не найден`);
      return null;
    }
    
    // Парсим данные товара
    const product = {
      id: productRow[0],
      categoryId: productRow[1],
      name: productRow[2],
      price: parseFloat(productRow[3]) || 0,
      description: productRow[4] || 'Описание отсутствует',
      image: productRow[5] || 'product_default.jpg',
      ed_izm: productRow[6] || 'шт',
      cena1: parseFloat(productRow[7]) || 0,
      ed_izm1: productRow[8] || '',
      cena2: parseFloat(productRow[9]) || 0,
      ed_izm2: productRow[10] || '',
      cena3: parseFloat(productRow[11]) || 0,
      ed_izm3: productRow[12] || '',
      cena4: parseFloat(productRow[13]) || 0,
      ed_izm4: productRow[14] || ''
    };
    
    // Получаем варианты цен
    const variants = getPriceVariants(product);
    product.variants = variants;
    product.hasMultipleVariants = variants.length > 1;
    
    console.log(`✅ Товар найден: "${product.name}"`);
    console.log(`📊 Найдено вариантов цен: ${variants.length}`, variants);
    
    return product;
    
  } catch (error) {
    console.error('❌ Ошибка поиска товара по ID:', error.message);
    return null;
  }
}

// 🔥 ИСПРАВЛЕННАЯ ФУНКЦИЯ: Поиск товара с вариантом цены
async function getProductWithVariant(productId, variantId) {
  try {
    console.log(`🔍 Поиск товара: ID=${productId}, вариант=${variantId}`);
    
    // Сначала находим основной товар
    const product = await getProductById(productId);
    if (!product) {
      console.log(`❌ Основной товар ${productId} не найден`);
      return null;
    }
    
    // Получаем все варианты цен для товара
    const variants = product.variants;
    
    // Ищем выбранный вариант
    let selectedVariant;
    
    if (variantId === 'main') {
      // Основной вариант
      selectedVariant = variants.find(v => v.isMain) || variants[0];
    } else {
      // Дополнительный вариант
      selectedVariant = variants.find(v => v.variantId === variantId);
    }
    
    if (!selectedVariant) {
      console.log(`❌ Вариант ${variantId} не найден для товара ${productId}`);
      // Возвращаем основной вариант как запасной
      selectedVariant = variants.find(v => v.isMain) || variants[0];
      if (!selectedVariant) {
        return null;
      }
      console.log(`⚠️ Используем запасной вариант: ${selectedVariant.variantId}`);
    }
    
    console.log(`✅ Найден вариант: ${selectedVariant.price}р / ${selectedVariant.ed_izm}`);
    
    // Возвращаем объект товара с выбранным вариантом
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      image: product.image,
      selectedPrice: selectedVariant.price,
      selectedEdIzm: selectedVariant.ed_izm,
      variantId: selectedVariant.variantId
    };
    
  } catch (error) {
    console.error('❌ Ошибка в getProductWithVariant:', error);
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
  getProductWithVariant,
  getCategoryName,
  testConnection
};