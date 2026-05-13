# Задача: доработка Emerald Grove Backend

## Контекст проекта
Emerald Grove — браузерное расширение (Chrome) + Spring Boot backend для сохранения
и анализа веб-статей.

**Backend:** Spring Boot 3, Java 21, PostgreSQL, Flyway, JPA/Hibernate
- Схема БД: `emerald_grove`
- Пакет: `com.emeraldgrove`
- Flyway-миграции V1–V3 уже применены
- `spring.jpa.hibernate.ddl-auto=validate`

**Frontend (уже готов):** React + TypeScript, Chrome Extension Manifest v3.
Фронт перешёл на @mozilla/readability — теперь при сохранении статьи отправляет
поле `content` (полный HTML статьи, может быть до 500 КБ, или `null` если
Readability не смог извлечь контент).

## Что нужно сделать
Подробный план со всеми изменениями, кодом и API-контрактом находится в файле:
[Emerald-Grove-Frontend/diplom_frontend/.obsidian/backend.md](cci:7://file:///C:/diplom/Emerald-Grove-Frontend/diplom_frontend/.obsidian/backend.md:0:0-0:0)

Прочитай этот файл первым делом — там расписаны все этапы.

Краткое содержание:

**Этап 5 — поле `content` в статье:**
- Flyway: `V4__add_article_content.sql` → `ALTER TABLE emerald_grove.article ADD COLUMN content TEXT`
- `Article.java`: новое поле `@Column(columnDefinition = "TEXT") private String content`
- DTO входящего sync-запроса (`ArticleSyncRequest` или аналог): поле `content`
- DTO исходящего ответа (`ArticleDto` или аналог): поле `content`
- Сервис: маппинг `article.setContent(request.getContent())` и обратно

**Этап 6 — AI-суммаризация через полный контент:**
- `GroqArticleSummaryService`: использовать `article.getContent()` вместо `article.getDescription()`
- Очистить HTML теги перед отправкой в Groq (Jsoup или regex)
- Обрезать до ~12 000 символов под лимит токенов
- После ответа AI: сохранить `summary.short` в `article.setDescription(...)`

## Правила работы
- Сначала прочитай [backend.md](cci:7://file:///C:/diplom/Emerald-Grove-Frontend/diplom_frontend/.obsidian/backend.md:0:0-0:0) и все релевантные файлы бэкенда перед внесением изменений
- Выполняй по одному этапу за раз, жди подтверждения перед следующим
- Начни с Этапа 5 (поле content)
