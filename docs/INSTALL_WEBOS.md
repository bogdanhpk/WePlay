# WePlay для LG webOS

Версия 1.0.1 включает общий интерфейс WePlay 1.22.45, поиск по каталогам, встроенный плеер, историю и избранное. Поддерживаются стрелки, OK, «Назад» и указатель Magic Remote. После установки достаточно подключения телевизора к интернету.

Сборка рассчитана на **webOS TV 5.0 и новее** (LG с 2020 года). Совместимость с конкретной моделью и форматы видео нужно проверить на телевизоре. Это пакет для Developer Mode.

[Скачать WePlay 1.0.1 для LG (.ipk)](https://github.com/bogdanhpk/WePlay/raw/refs/heads/main/downloads/app.weplay.tv_1.0.1_all.ipk)

## Установка

1. Подключите компьютер и телевизор LG к одной сети. На телевизоре установите **Developer Mode** из LG Content Store и войдите в аккаунт LG Developer.
2. Включите **Dev Mode Status** и дождитесь перезапуска телевизора. Снова откройте Developer Mode, включите **Key Server** и запишите IP-адрес и код из шести символов с экрана.
3. Установите webOS CLI на компьютер и добавьте телевизор. В командах замените `IP_ТЕЛЕВИЗОРА` адресом с экрана.

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device --add lg --info "host=IP_ТЕЛЕВИЗОРА" --info "port=9922" --info "username=prisoner"
   ares-novacom --device lg --getkey
   ```

4. Введите код, когда CLI его запросит. Перейдите в папку с файлом `app.weplay.tv_1.0.1_all.ipk` и выполните:

   ```sh
   ares-install --device lg app.weplay.tv_1.0.1_all.ipk
   ares-launch --device lg app.weplay.tv
   ```

Следите за сроком сессии в Developer Mode и продлевайте его до истечения. Когда режим разработчика отключается, webOS удаляет приложения, установленные через него. Для обновления устанавливайте новый IPK с тем же ID поверх текущего. История и избранное хранятся локально на телевизоре.

[Инструкция LG по Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)

## Сборка из исходников

Понадобятся Node.js 18+ и webOS CLI. Выполните команду из корня репозитория.

```sh
node webos/build.cjs ./app ./webos/dist
```

В `webos/dist` появятся IPK и контрольная сумма SHA-256. Сборщик берёт общие страницы и ресурсы, добавляет адаптер пульта LG и сетевую службу. Личные ключи в пакет не попадают. Библиотека LG в `platform/vendor` распространяется с лицензией Apache 2.0.
