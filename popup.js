const toggleBtn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('status');
const ipInfoBlock = document.getElementById('ip-info');
const prevIP = document.getElementById('prev-ip');
const currIP = document.getElementById('curr-ip');

// Элементы UI для состояния
const connectionStatus = document.getElementById('connection-status');
const pingResult = document.getElementById('ping-result');
const nextCheckTimer = document.getElementById('next-check-timer');

// Выбор типа прокси
const proxyTypeSelect = document.getElementById('proxyTypeSelect');

// Переключение вкладок
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');

    // Удалить активные классы
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    // Активировать нужную вкладку
    tab.classList.add('active');
    document.getElementById(target).classList.remove('hidden');
    document.getElementById(target).classList.add('active');
  });
});

// Загрузка состояния при запуске
chrome.storage.local.get(['proxyEnabled', 'proxyType'], ({ proxyEnabled, proxyType }) => {
  updateUI(proxyEnabled);
  proxyTypeSelect.value = proxyType || 'http';
});

// Сохраняем выбранный тип прокси
proxyTypeSelect.addEventListener('change', () => {
  const selectedType = proxyTypeSelect.value;
  chrome.storage.local.set({ proxyType: selectedType });
});

// Переключатель прокси
toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get(['proxyEnabled', 'proxyType'], ({ proxyEnabled, proxyType }) => {
    const newState = !proxyEnabled;
    chrome.storage.local.set({ proxyEnabled: newState });

    if (newState) {
      let scheme = proxyType === 'socks5' ? 'socks5' : 'http';
      let port = proxyType === 'socks5' ? 1080 : 1609;

      chrome.proxy.settings.set({
        value: {
          mode: "fixed_servers",
          rules: {
            singleProxy: {
              scheme: scheme,
              host: "185.125.101.148", // <-- ЗАМЕНИ НА СВОЙ ПРОКСИ
              port: port
            },
            bypassList: ["localhost"]
          }
        },
        scope: "regular"
      }, () => {
        updateUI(true);
        updateIPInfo(); // показать IP

        // Запрашиваем немедленную проверку
        chrome.runtime.sendMessage({ action: "runHealthCheckNow" }, () => {
          console.log('[Popup] Запрошена немедленная проверка');
        });
      });
    } else {
      chrome.proxy.settings.clear({ scope: "regular" }, () => {
        updateUI(false);
        ipInfoBlock.classList.add("hidden");

        // === Отправляем сообщение о выключении ===
        chrome.runtime.sendMessage({ action: "proxyDisabled" });
      });
    }
  });
});

function updateUI(enabled) {
  statusEl.textContent = enabled ? "Статус: включено" : "Статус: отключено";
  toggleBtn.textContent = enabled ? "Отключить" : "Включить";

  if (!enabled) {
    connectionStatus.textContent = 'отключено';
    connectionStatus.className = '';
    pingResult.textContent = '-';
    nextCheckTimer.textContent = '-';
  }
}

async function getCurrentIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch (e) {
    return "ошибка";
  }
}

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
      pingResult.textContent = response.ping + ' мс';

      if (response.status === 'Стабильно') {
        connectionStatus.className = '';
      } else if (response.status === 'Проверяется...') {
        connectionStatus.className = 'connection-checking';
      } else {
        connectionStatus.className = 'connection-bad';
      }

      if (response.nextCheckIn !== undefined) {
        let timeLeft = Math.max(0, Math.floor(response.nextCheckIn / 1000));
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        nextCheckTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  });
}

// Запрашиваем состояние каждые 2 секунды
setInterval(requestBackgroundData, 2000);
requestBackgroundData();

// === Добавлено: обновление пинга каждые 5 секунд (только если прокси включён) ===
function fetchLivePing() {
  chrome.storage.local.get(['proxyEnabled'], ({ proxyEnabled }) => {
    if (!proxyEnabled) {
      pingResult.textContent = '-';
      return;
    }

    chrome.runtime.sendMessage({ action: "getPingNow" }, (response) => {
      if (response && response.ping !== undefined) {
        const pingText = response.ping !== null ? `${response.ping} мс` : '–';
        pingResult.textContent = pingText;
      }
    });
  });
}

setInterval(fetchLivePing, 5000);
fetchLivePing(); // сразу при загрузкеч