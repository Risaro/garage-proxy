// Текущее состояние прокси
let proxyHealth = {
  status: 'Неизвестно',
  ping: '-',
  lastCheck: null
};

// Сохраняем состояние в storage
function saveState() {
  chrome.storage.local.set({
    proxyHealth: {
      status: proxyHealth.status,
      ping: proxyHealth.ping,
      lastCheck: proxyHealth.lastCheck ? proxyHealth.lastCheck.toString() : null
    }
  });
}

// Восстанавливаем состояние из storage
function restoreState() {
  chrome.storage.local.get('proxyHealth', (res) => {
    if (res.proxyHealth) {
      proxyHealth = {
        status: res.proxyHealth.status,
        ping: res.proxyHealth.ping,
        lastCheck: res.proxyHealth.lastCheck ? new Date(res.proxyHealth.lastCheck) : null
      };
      broadcastHealth();
    }
  });
}

// Отправка данных в popup
function broadcastHealth() {
  try {
    chrome.runtime.sendMessage({
      type: 'proxyHealthUpdate',
      ...proxyHealth
    });
  } catch (e) {
    // Popup не подключен, ничего страшного
  }
}

// Простая проверка (быстрая)
function quickCheck() {
  proxyHealth.status = 'Проверяется...';
  broadcastHealth();
  
  const start = Date.now();
  
  fetch('https://www.google.com/generate_204', {
    mode: 'no-cors',
    cache: 'no-store'
  }).then(() => {
    const end = Date.now();
    proxyHealth.status = 'Стабильно';
    proxyHealth.ping = end - start;
    proxyHealth.lastCheck = new Date();
    broadcastHealth();
    saveState();
  }).catch(error => {
    proxyHealth.status = 'Ошибка';
    proxyHealth.ping = '–';
    broadcastHealth();
    saveState();
  });
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getProxyHealth") {
    sendResponse({
      status: proxyHealth.status,
      ping: proxyHealth.ping
    });
    return true;
  }

  if (msg.action === "runHealthCheckNow") {
    quickCheck();
    return true;
  }

  if (msg.action === "getPingNow") {
    sendResponse({
      ping: proxyHealth.ping === '-' || proxyHealth.ping === '–' ? null : proxyHealth.ping
    });
    return true;
  }

  if (msg.action === "proxyDisabled") {
    proxyHealth = {
      status: 'отключено',
      ping: '-',
      lastCheck: null
    };
    broadcastHealth();
    saveState();
    return true;
  }
});

// Инициализация
chrome.runtime.onInstalled.addListener(() => {
  restoreState();
});

// Восстанавливаем состояние при старте
chrome.runtime.onStartup.addListener(() => {
  restoreState();
});

// Восстанавливаем состояние сразу
restoreState();