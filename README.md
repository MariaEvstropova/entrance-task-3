# Задание 3

Мобилизация.Гифки – сервис для поиска гифок в перерывах между занятиями.

1. Проблема "Разложить файлы красиво" - необходимо перенести `service-worker.js` в директорию `entrance-task-3`. Т.к. `service worker` обрабатывает те запросы, которые находятся в зоне его видимости (`scope`). Максимальная зона видимости - местоположение `service-worker.js`.

![important-notes](https://mdn.mozillademos.org/files/12630/important-notes.png)

Соответственно так же необходимо изменить "адрес" `service worker`a при его регистрации в файле `blocks.js`.

2. Проблема "Более надёжное кеширование на этапе `fetch` и его последствия

Есть 2 варианта решения проблемы того, что `gifs.html` не записывается в кеш:
а) можно записать его в кеш на этапе `install`.
б) можно так занести файл в перечень файлов для кеширования
```javascript
function needStoreForOffline(cacheKey) {
    return cacheKey.includes('vendor/') ||
        cacheKey.includes('assets/') ||
        cacheKey.endsWith('gifs.html') ||
        cacheKey.endsWith('jquery.min.js');
}
```
Учитывая требование, что `gifs.html` должен браться из кеша только тогда, когда интернет-соединение отсутствует, и требования дополнительного задания, метод `needStoreForOffline()` упразднен. А ресурсы необходимы для работы приложения в офлайн-режиме (в том числе и `gifs.html`) заносятся в кеш на этапе `install`.
В сочетании с тем, что на этапе `activate` используется вызов метода `clients.claim()` такое решение обеспечивает возможность переключения в офлайн-режим после первого же запроса.
Надо отметить, что решение несет определенный риск, т.к. если хотя бы один из ресурсов `FILES_TO_CACHE` не будет загружен, `service worker` не будет установлен.

3. Проблема "невозможно обновить статику из директорий `vendor` и `assets`" - для обновления ресурсов необходимо изменить `CACHE_VERSION`. Тогда будет вызван метод `deleteObsoleteCaches()`.


## Ответы на вопросы, помеченный в файле `service-worker.js`:

1. Вызов метода `skipWaiting()`

Данный вызов необходим при обновленнии `service worker`а. После того, как обновленный `service worker` успешно регистрируется на странице, он не начинает немедленно обрабатывать запросы. Вместо этого он будет находится в режиме ожидания, в то время как предыдущий `service worker` будет продолжать свою работу.
Новый `service worker` начнет функционировать только после того как все подконтрольные старому `service worker`у страницы будут закрыты.
Вызов метода `skipWaiting` изменяет поведение так, что обновленный `service worker` немедленно начинает работу.
https://developers.google.com/web/fundamentals/instant-and-offline/service-worker/lifecycle

2. Вызов метода `clients.claim()`

Даже после успешной регистрации `service worker` начинает контролировать страницу только после того как станет активным, то есть только после перезагрузки страницы. Вызов `clients.claim()` позволяет переопределить такое поведение.

3. Для всех ли случаев подойдет такой ключ `url.origin + url.pathname`

Если у запроса будет значимый параметр `url.search` при таком построении ключа он не будет учтен.
Например для запроса https://yandex.ru/images/search?text=cat будет составлен ключ https://yandex.ru/images/search
https://pix.my/tjH7VL

4. Зачем нужна цепочка вызовов `name !== CACHE_VERSION`

При обновлении `service worker`а необходимо изменить версию кеша с которой он будет взаимодействовать.
Это нужно для того, чтобы безболезненно записывать новые данные, не повреждая при этом данные того кеша, которым пользуется предыдущая версия `service worker`а, находящаяся в работе.
Однако, когда новая версия `service worker`а становится активной (у старой версии `service worker`а не осталось подконтрольных страниц), предыдущая версия кеша может быть удалена. Что и производится в цепочке вызовов.

5. "Для чего нужно клонирование?"

Потоки запроса и ответа могут быть прочитаны только единожды. Чтобы ответ был получен браузером и сохранен в кеше — нужно клонировать его.
Так, оригинальный объект отправится браузеру, а клон будет закеширован.
