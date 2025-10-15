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
// Получение товаров по категории (ОБНОВЛЕННАЯ ВЕРСИЯ)
async function getProductsByCategory(categoryId) {
  try {
    console.log(`📦 Загрузка товаров для категории ${categoryId}...`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:G', // ← ОБНОВЛЕНО: читаем до колонки G
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

// 🔧 ОБНОВЛЕННАЯ ФУНКЦИЯ: Получение товара по ID с поддержкой мультицен
async function getProductById(productId) {
  try {
    console.log(`🔍 Поиск товара по ID: ${productId}`);
    
    const response = await withTimeout(sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:O', // ← ОБНОВЛЕНО: читаем до колонки O
    }), 15000);
    
    const products = response.data.values || [];
    const product = products.find(p => p[0] === productId);
    
    if (product) {
      console.log(`✅ Товар найден:`, product[2]);
      
      // Основная цена и единица измерения
      const mainPrice = product[3];
      const mainEdIzm = product[6] || 'шт';
      
      // Собираем ВСЕ варианты цен (основная + дополнительные)
      const variants = [];
      
      // Добавляем основную цену (если не пустая)
      if (mainPrice && mainPrice > 0) {
        variants.push({
          price: parseFloat(mainPrice),
          ed_izm: mainEdIzm,
          isMain: true,
          variantId: 'main'
        });
      }
      
      // Добавляем дополнительные цены (Cena1 - Cena4)
      for (let i = 1; i <= 4; i++) {
        const cenaIndex = 7 + (i - 1) * 2; // H, J, L, N
        const edIzmIndex = cenaIndex + 1;   // I, K, M, O
        
        const cena = product[cenaIndex];
        const edIzm = product[edIzmIndex];
        
        // Добавляем только если цена не пустая и больше 0
        if (cena && !isNaN(cena) && parseFloat(cena) > 0) {
          variants.push({
            price: parseFloat(cena),
            ed_izm: edIzm || 'шт',
            variantId: `variant_${i}`
          });
        }
      }
      
      // Сортируем варианты по цене (от меньшей к большей)
      variants.sort((a, b) => a.price - b.price);
      
      const productData = {
        id: product[0],
        categoryId: product[1],
        name: product[2],
        price: parseFloat(mainPrice), // для обратной совместимости
        description: product[4] || 'Описание отсутствует',
        image: product[5] || 'product_default.jpg',
        variants: variants, // ← НОВОЕ ПОЛЕ: массив всех вариантов
        hasMultipleVariants: variants.length > 1 // флаг множественных вариантов
      };
      
      console.log(`📊 Найдено вариантов цен: ${variants.length}`, variants);
      return productData;
    }
    
    console.log('❌ Товар с ID', productId, 'не найден');
    return null;
    
  } catch (error) {
    console.error('❌ Ошибка поиска товара по ID:', error.message);
    return null;
  }
}

// 🔧 НОВАЯ ФУНКЦИЯ: Получение товара по ID с вариантом цены
async function getProductWithVariant(productId, variantId) {
  try {
    const product = await getProductById(productId);
    
    if (!product) return null;
    
    // Если variantId не указан, возвращаем основной вариант
    if (!variantId || variantId === 'main') {
      const mainVariant = product.variants.find(v => v.isMain) || product.variants[0];
      return {
        ...product,
        selectedVariant: mainVariant,
        selectedPrice: mainVariant.price,
        selectedEdIzm: mainVariant.ed_izm
      };
    }
    
    // Ищем указанный вариант
    const selectedVariant = product.variants.find(v => v.variantId === variantId);
    
    if (selectedVariant) {
      return {
        ...product,
        selectedVariant: selectedVariant,
        selectedPrice: selectedVariant.price,
        selectedEdIzm: selectedVariant.ed_izm
      };
    }
    
    // Если вариант не найден, возвращаем основной
    const mainVariant = product.variants.find(v => v.isMain) || product.variants[0];
    return {
      ...product,
      selectedVariant: mainVariant,
      selectedPrice: mainVariant.price,
      selectedEdIzm: mainVariant.ed_izm
    };
    
  } catch (error) {
    console.error('❌ Ошибка получения товара с вариантом:', error.message);
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

// 🔧 НОВАЯ ФУНКЦИЯ: Тестирование мультиценовой системы
async function testMultiPrice() {
  try {
    console.log('🧪 Тестирование мультиценовой системы...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A2:O',
    });
    
    const products = response.data.values || [];
    console.log(`📊 Всего товаров: ${products.length}`);
    
    // Протестируем первые 3 товара
    for (let i = 0; i < Math.min(3, products.length); i++) {
      const product = products[i];
      if (product && product[0]) {
        const productData = await getProductById(product[0]);
        if (productData) {
          console.log(`📦 ${productData.name}: ${productData.variants.length} вариантов`);
          productData.variants.forEach(v => {
            console.log(`   💰 ${v.price} руб / ${v.ed_izm} (${v.variantId})`);
          });
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка тестирования мультицен:', error);
    return false;
  }
}

module.exports = { 
  getCategories, 
  getProductsByCategory, 
  getProductById, 
  getProductWithVariant,
  getCategoryName,
  testConnection,
  testMultiPrice
};