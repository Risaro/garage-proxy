// Интервал проверки: 15 минут = 900000 мс
const CHECK_INTERVAL = 15 * 60 * 1000;

// URL для проверки доступности через прокси
const TEST_URL = 'https://www.google.ru';

// Настройки твоего прокси
const proxyConfig = {
  mode: "fixed_servers",
  rules: {
    singleProxy: {
      scheme: "http",
      host: "185.125.101.148", // замени на свой
      port: 1609
    },
    bypassList: ["localhost"]
  }
};

let proxyHealth = {
  status: 'Неизвестно',
  ping: '-',
  lastCheck: null,
  nextCheckAt: Date.now() + CHECK_INTERVAL
};

// Функция проверки доступности сайта через прокси
async function checkProxy() {
  proxyHealth.status = 'Проверяется...';
  broadcastHealth();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Таймаут 10 секунд

    const start = Date.now();

    const response = await fetch(TEST_URL, {
      method: 'HEAD',
      mode: 'no-cors', // важно для проверки доступности
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const end = Date.now();

    if (response.ok) {
      proxyHealth.status = 'Стабильно';
      proxyHealth.ping = end - start;
      proxyHealth.lastCheck = new Date();
      proxyHealth.nextCheckAt = Date.now() + CHECK_INTERVAL;
      console.log('[Proxy] Работает нормально');
      return true;
    }

    console.warn('[Proxy] Неожиданный ответ:', response.status);
    proxyHealth.status = 'Ошибка';
    proxyHealth.ping = '–';
    return false;

  } catch (error) {
    console.error('[Proxy] Ошибка проверки:', error.message);
    proxyHealth.status = 'Ошибка';
    proxyHealth.ping = '–';
    return false;
  }
}

// Переподключение к прокси
function reconnectProxy() {
  chrome.proxy.settings.set({
    value: proxyConfig,
    scope: "regular"
  }, () => {
    console.log('[Proxy] Прокси переподключён');
    chrome.storage.local.set({ proxyEnabled: true });
  });
}

// Основной цикл проверки
async function startHealthCheck() {
  chrome.storage.local.get(['proxyEnabled'], async ({ proxyEnabled }) => {
    if (!proxyEnabled) {
      console.log('[Background] Прокси выключен. Проверка остановлена.');
      return;
    }

    proxyHealth.status = 'Проверяется...';
    broadcastHealth();

    const isWorking = await checkProxy();

    if (!isWorking) {
      console.log('[Proxy] Проблемы с прокси. Переподключаем...');
      reconnectProxy();
    }
  });
}

// Отправляем данные в popup
function broadcastHealth() {
  chrome.runtime.connect().postMessage({
    type: 'proxyHealth',
    ...proxyHealth
  });
}

// Для запросов из popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getProxyHealth") {
    const now = Date.now();
    const nextCheckIn = proxyHealth.nextCheckAt - now;
    sendResponse({
      status: proxyHealth.status,
      ping: proxyHealth.ping,
      nextCheckIn: nextCheckIn > 0 ? nextCheckIn : 0
    });
  }

  if (msg.action === "runHealthCheckNow") {
    console.log('[Background] Запущена немедленная проверка...');
    checkProxy().then(isWorking => {
      if (!isWorking) {
        reconnectProxy();
      }
      broadcastHealth(); // Обновляем UI
    });
  }

  if (msg.action === "getPingNow") {
    // Отправляем последний известный пинг
    sendResponse({
      ping: proxyHealth.ping === '-' || proxyHealth.ping === '–' ? null : proxyHealth.ping
    });
  }

  if (msg.action === "proxyDisabled") {
    console.log('[Background] Прокси выключен. Сбрасываем состояние...');
    proxyHealth.status = 'отключено';
    proxyHealth.ping = '-';
    proxyHealth.nextCheckAt = null;
    broadcastHealth();
  }
});

// Запуск периодической проверки
chrome.runtime.onInstalled.addListener(() => {
  setInterval(startHealthCheck, CHECK_INTERVAL);
  startHealthCheck(); // запустить сразу после установки
});