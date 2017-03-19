'use strict';
/**
 * @file
 * Сервис-воркер, обеспечивающий оффлайновую работу избранного
 */

const CACHE_VERSION = '1.0.6';
const FILES_TO_CACHE = [
    'gifs.html',
    './assets/blocks.js',
    './assets/star.svg',
    './assets/style.css',
    './assets/templates.js',
    './vendor/bem-components-dist-5.0.0/touch-phone/bem-components.dev.js',
    './vendor/bem-components-dist-5.0.0/touch-phone/bem-components.dev.css',
    './vendor/kv-keeper.js-1.0.4/kv-keeper.js'
];
//Если гифка была добавлена в офлайне, записать сюда её url чтобы закешировать потом
let failedToLoad = [];

importScripts('./vendor/kv-keeper.js-1.0.4/kv-keeper.js');


self.addEventListener('install', event => {
    const promise = preCacheAssets()
        .then(() => preCacheAllFavorites())
        // Вопрос №1: зачем нужен этот вызов?
        .then(() => self.skipWaiting())
        .then(() => console.log('[ServiceWorker] Installed!'));


    event.waitUntil(promise);
});

self.addEventListener('activate', event => {
    const promise = deleteObsoleteCaches()
        .then(() => {
            // Вопрос №2: зачем нужен этот вызов?
            self.clients.claim();

            console.log('[ServiceWorker] Activated!');
        });

    event.waitUntil(promise);
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const cacheKey = url.origin + url.pathname;

    let response;
    //Проверить не надо ли кешировать этот запрос
    if (failedToLoad.includes(cacheKey)) {
        response = fetchAndPutToCache(cacheKey, event.request);
    } else {
        response = fetchWithFallbackToCache(event.request);
    }
    event.respondWith(response);
});

self.addEventListener('message', event => {
    const promise = handleMessage(event.data);

    event.waitUntil(promise);
});

function preCacheAssets() {
  return caches.open(CACHE_VERSION)
      .then(cache => {
          return cache.addAll(FILES_TO_CACHE);
      });
}

// Положить в новый кеш все добавленные в избранное картинки
function preCacheAllFavorites() {
    return getAllFavorites()
        .then(urls => Promise.all(
            urls.map(url => fetch(url)))
        )
        .then(responses => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    return Promise.all(
                        responses.map(response => cache.put(response.url, response))
                    );
                });
        });
}

// Извлечь из БД добавленные в избранное картинки
function getAllFavorites() {
    return new Promise((resolve, reject) => {
        KvKeeper.getKeys((err, keys) => {
            if (err) {
                return reject(err);
            }

            const ids = keys
                .filter(key => key.startsWith('favorites:'))
                // 'favorites:'.length == 10
                .map(key => key.slice(10));

            Promise.all(ids.map(getFavoriteById))
                .then(urlGroups => {
                    return urlGroups.reduce((res, urls) => res.concat(urls), []);
                })
                .then(resolve, reject);
        });
    });
}

// Извлечь из БД запись о картинке
function getFavoriteById(id) {
    return new Promise((resolve, reject) => {
        KvKeeper.getItem('favorites:' + id, (err, val) => {
            if (err) {
                return reject(err);
            }

            const data = JSON.parse(val);
            const images = [data.fallback].concat(data.sources.map(item => item.url));

            resolve(images);
        });
    });
}

// Удалить неактуальный кеш
function deleteObsoleteCaches() {
    return caches.keys()
        .then(names => {
            // Вопрос №4: зачем нужна эта цепочка вызовов?
            return Promise.all(
                names.filter(name => name !== CACHE_VERSION)
                    .map(name => {
                        console.log('[ServiceWorker] Deleting obsolete cache:', name);
                        return caches.delete(name);
                    })
            );
        });
}

// Скачать и добавить в кеш
function fetchAndPutToCache(cacheKey, request) {
    return fetch(request)
        .then(response => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    // Вопрос №5: для чего нужно клонирование?
                    cache.put(cacheKey, response.clone())
                    .then(() => {
                        //Успешно закешировали, уберем из списка
                        let indexToRemove = failedToLoad.indexOf(cacheKey);
                        if (indexToRemove !== -1) {
                            failedToLoad.splice(indexToRemove, 1);
                        }
                    });
                })
                .then(() => response);
        })
        .catch(err => {
            console.error('[ServiceWorker] Fetch error:', err);
            return caches.match(cacheKey);
        });
}

// Попытаться скачать, при неудаче обратиться в кеш
function fetchWithFallbackToCache(request) {
    return fetch(request)
        .catch(() => {
            console.log('[ServiceWorker] Fallback to offline cache:', request.url);
            const url = new URL(request.url);
            const cacheKey = url.origin + url.pathname;
            return caches.match(cacheKey);
        });
}

// Обработать сообщение от клиента
const messageHandlers = {
    'favorite:add': handleFavoriteAdd,
    'favorite:remove': handleFavoriteRemove
};

function handleMessage(eventData) {
    const message = eventData.message;
    const id = eventData.id;
    const data = eventData.data;

    console.log('[ServiceWorker] Got message:', message, 'for id:', id);

    const handler = messageHandlers[message];
    return Promise.resolve(handler && handler(id, data));
}

// Обработать сообщение о добавлении новой картинки в избранное
function handleFavoriteAdd(id, data) {
    return caches.open(CACHE_VERSION)
        .then(cache => {
            const urls = [].concat(
                data.fallback,
                (data.sources || []).map(item => item.url)
            );

            return Promise
                .all(urls.map(url => fetch(url)))
                .then(responses => {
                    return Promise.all(
                        responses.map(response => cache.put(response.url, response))
                    );
                })
                .catch((response) => {
                    console.log('[ServiceWorker] Can\'t put to cache:', id);
                    //Не удалось закешировать, запишем в массив и закешируем при след. запросе
                    urls.forEach(url => failedToLoad.push(url));
                });
        });
}

// Обработать сообщение об удалении картинки из избранного
function handleFavoriteRemove(id, data) {
    return caches.open(CACHE_VERSION)
        .then(cache => {
            const urls = [].concat(
                data.fallback,
                (data.sources || []).map(item => item.url)
            );

            return Promise
                .all(urls.map(url => cache.delete(url)))
                .catch((response) => {
                    console.log('[ServiceWorker] Can\'t remove from cache:', id);
                });
        });
}
