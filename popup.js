const toggleBtn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('status');
const ipInfoBlock = document.getElementById('ip-info');
const prevIP = document.getElementById('prev-ip');
const currIP = document.getElementById('curr-ip');

// Элементы UI для состояния
const connectionStatus = document.getElementById('connection-status');

// Переключение вкладок
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');

    // Удалить активные классы
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.add('hidden');
      c.classList.remove('active');
    });

    // Активировать нужную вкладку
    tab.classList.add('active');
    const targetElement = document.getElementById(target);
    targetElement.classList.remove('hidden');
    targetElement.classList.add('active');
  });
});

// Загрузка состояния при запуске
function loadState() {
  chrome.storage.local.get(['proxyEnabled', 'proxyHealth'], ({ proxyEnabled, proxyHealth }) => {
    updateUI(proxyEnabled);
    
    if (proxyHealth) {
      connectionStatus.textContent = proxyHealth.status;
      
      // Цвет статуса
      connectionStatus.className = '';
      if (proxyHealth.status === 'Проверяется...') {
        connectionStatus.classList.add('connection-checking');
      } else if (!proxyHealth.status.includes('Стабильно')) {
        connectionStatus.classList.add('connection-bad');
      }
    }
    
    // Запрашиваем актуальные данные
    requestBackgroundData();
  });
}

// Переключатель прокси
toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get(['proxyEnabled'], ({ proxyEnabled }) => {
    const newState = !proxyEnabled;
    chrome.storage.local.set({ proxyEnabled: newState });

    if (newState) {
      // Мгновенно обновляем интерфейс
      updateUI(true);
      connectionStatus.textContent = 'Проверяется...';
      connectionStatus.className = 'connection-checking';
      
      chrome.proxy.settings.set({
        value: {
          mode: "fixed_servers",
          rules: {
            singleProxy: {
              scheme: "socks5",
              host: "88.218.120.66",  // Твой сервер
              port: 80                 // Порт 80
            },
            bypassList: ["localhost"]
          }
        },
        scope: "regular"
      }, () => {
        // Запрашиваем проверку
        chrome.runtime.sendMessage({ action: "runHealthCheckNow" });
        updateIPInfo();
      });
    } else {
      // Мгновенно обновляем интерфейс
      updateUI(false);
      connectionStatus.textContent = 'отключено';
      connectionStatus.className = '';
      ipInfoBlock.classList.add("hidden");
      
      chrome.proxy.settings.clear({ scope: "regular" }, () => {
        chrome.runtime.sendMessage({ action: "proxyDisabled" });
      });
    }
  });
});

// Обновление UI
function updateUI(enabled) {
  statusEl.textContent = enabled ? "Статус: включено" : "Статус: отключено";
  toggleBtn.textContent = enabled ? "Отключить" : "Включить";
}

// Получение текущего IP
async function getCurrentIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch (e) {
    return "ошибка";
  }
}

// Обновление информации об IP
async function updateIPInfo() {
  const current = await getCurrentIP();

  chrome.storage.local.get(['lastIP'], (res) => {
    const previous = res.lastIP || "неизвестен";
    prevIP.textContent = previous;
    currIP.textContent = current;
    ipInfoBlock.classList.remove("hidden");
    chrome.storage.local.set({ lastIP: current });
  });
}

// Получаем данные из background
function requestBackgroundData() {
  chrome.runtime.sendMessage({ action: "getProxyHealth" }, (response) => {
    if (response && response.status) {
      connectionStatus.textContent = response.status;

      // Цвет статуса
      connectionStatus.className = '';
      if (response.status === 'Проверяется...') {
        connectionStatus.classList.add('connection-checking');
      } else if (!response.status.includes('Стабильно')) {
        connectionStatus.classList.add('connection-bad');
      }
    }
  });
}

// Загружаем состояние при старте
document.addEventListener('DOMContentLoaded', loadState);

// Обновляем данные при открытии popup
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadState();
  }
});

// Проверка каждые 10 секунд
setInterval(requestBackgroundData, 10000);