# WePlay для Android TV

Android TV / Google TV 8.0 и новее, Android System WebView. Версия **1.0.1**: встроенный интерфейс, пульт, HTML5/HLS-плеер и уведомления о новых APK из GitHub. Для работы нужен интернет; компьютер и сервер в локальной сети не нужны.

[Скачать APK 1.0.1](https://github.com/bogdanhpk/WePlay/raw/refs/heads/main/downloads/WePlay-AndroidTV-1.0.1.apk) · [Установка](https://github.com/bogdanhpk/WePlay/blob/main/docs/INSTALL_ANDROID_TV.md)

## Обновления

При появлении нового APK рядом с «Поддержать» отображается кнопка «Доступна новая версия» с иконкой скачивания и свечением. После выбора «Скачать и обновить» приложение загружает файл, проверяет его и открывает системное подтверждение Android.

Первый переход с 1.0.0 на 1.0.1 выполняется установкой APK вручную поверх существующего приложения. История и избранное сохраняются. Каналы Tizen и Android независимы.

[Публикация следующих версий](https://github.com/bogdanhpk/WePlay/blob/main/docs/ANDROID_UPDATES.md).

## Сборка

Нужны Node.js, JDK 17, Android SDK Platform 35 и Build Tools 35.0.0. Gradle Wrapper включён.

```sh
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug
./gradlew assembleRelease
```

Перед сборкой `tools/sync-web.cjs` переносит общий интерфейс из соседнего каталога `app/` и добавляет Android-адаптер. Личный `settings.js` заменяется пустыми настройками. Загрузчик обновлений Tizen в APK не включается. В отдельном архиве исходников также может использоваться уже комплектный интерфейс.

Версии задаются в `version.properties`. Release APK необходимо подписать постоянным Android-ключом через `apksigner`. Ключи и пароли не входят в исходники.

## Публикация

Из корня репозитория:

```sh
node android/tools/make-update.cjs /path/to/signed-WePlay.apk --out .
```

Скрипт подготавливает APK, описание Android-канала и контрольную сумму. Публикуйте их одним коммитом, увеличивая `versionCode` и `versionName` для каждого нового выпуска.

## Проверка обновлений

```sh
node tools/test-updates.cjs emulator-5556
```

Скрипт использует отдельный debug-пакет и временный тестовый ключ. Он проверяет версии, подписи, повреждённые файлы, отмену, работу без сети, реальную загрузку с GitHub и одновременную проверку новых версий во время скачивания.

## Основные файлы

- `MainActivity.java` — запуск, пульт, жизненный цикл, разрешение и системное подтверждение установки.
- `ApkUpdates.java` — проверка, загрузка, хранение и валидация APK.
- `ApkUpdate.java` — проверка Android-канала.
- `GitHubUpdateSource.java` — HTTPS-загрузка с GitHub.
- `NetworkTransport.java` — загрузка каталогов и HLS внутри приложения.
- `platform/android-updates.js` — кнопка, окно обновления, прогресс и навигация с пульта.

История и избранное хранятся локально. Наличие озвучек, серий, качества и субтитров зависит от источника, а поддержка кодеков — от устройства и WebView. Изображения и данные: TMDB, TVmaze и другие каталоги. Лицензии библиотек находятся в `licenses/`.
