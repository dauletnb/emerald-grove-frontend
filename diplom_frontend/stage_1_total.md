# Этап 1: Итог реализации Backend и требования к Frontend

## Что реализовано в Backend

В backend полностью реализована базовая система коллекций:

- хранение пользовательских коллекций;
- хранение связей "статья -> коллекция";
- CRUD для коллекций;
- online-операции добавления и удаления статьи из коллекции;
- bulk sync коллекций;
- bulk sync membership-связей;
- получение списка статей коллекции;
- получение списка коллекций для статьи.

### Добавленные backend-компоненты

#### Entity

- `ArticleCollection`
- `ArticleCollectionLink`

#### DTO

- `CollectionDto`
- `CollectionRequestDto`
- `CollectionSyncDto`
- `CollectionLinkSyncDto`

#### Repository

- `ArticleCollectionRepository`
- `ArticleCollectionLinkRepository`

#### Service

- `CollectionService`
- `CollectionServiceImpl`

#### Controller

- `CollectionController`
- дополнительный endpoint в `ArticleController` для получения коллекций статьи

#### Migration

- `V2__create_collections_tables.sql`

---

## Что важно понимать Frontend

### 1. Backend теперь является источником истины после sync

Frontend может продолжать использовать IndexedDB:

- как локальный кэш;
- как оффлайн-слой;
- как временное хранилище pending-изменений.

Но после успешного sync актуальное состояние должно подтягиваться с backend.

### 2. Нельзя создавать одну и ту же коллекцию одновременно двумя путями

Нельзя делать такой flow:

1. создать коллекцию локально;
2. вызвать `POST /api/collections`;
3. затем отправить эту же коллекцию через `/api/collections/sync`.

Так можно получить дубли по смыслу.

Правильная схема:

- online create: создать на backend и сохранить ответ в IndexedDB;
- offline create: создать локально и потом отправить через bulk sync.

### 3. Коллекции и membership-связи синхронизируются отдельно

Недостаточно синхронизировать только store `collections`.

Отдельно надо синхронизировать:

- сами коллекции;
- membership-связи `articleExternalId <-> collectionExternalId`.

Если синхронизировать только коллекции, после логина на другом устройстве коллекции будут существовать, но окажутся пустыми.

---

## Реально доступные endpoint'ы Backend

Все endpoint'ы требуют авторизацию, как и остальной `/api/**`.

## Коллекции

### `POST /api/collections`
Создать коллекцию.

#### Request body

```json
{
  "name": "My collection"
}
```

#### Response

`201 Created`

```json
{
  "id": 1,
  "externalId": "uuid",
  "name": "My collection",
  "createdAt": 1712160000000,
  "updatedAt": 1712160000000,
  "articleCount": 0,
  "articleIds": []
}
```

### `PUT /api/collections/{externalId}`
Переименовать коллекцию.

#### Request body

```json
{
  "name": "Renamed collection"
}
```

#### Response

`200 OK`

Возвращает `CollectionDto`.

### `DELETE /api/collections/{externalId}`
Удалить коллекцию.

#### Response

`204 No Content`

Связи со статьями удаляются каскадно.

### `GET /api/collections`
Получить все коллекции пользователя.

#### Response

`200 OK`

```json
[
  {
    "externalId": "uuid-1",
    "name": "Collection 1"
  },
  {
    "externalId": "uuid-2",
    "name": "Collection 2"
  }
]
```

Важно: этот endpoint возвращает `CollectionSyncDto`, то есть без `createdAt`, `updatedAt`, `articleCount` и `articleIds`.

### `GET /api/collections/{externalId}`
Получить одну коллекцию с полным payload.

#### Response

`200 OK`

Возвращает `CollectionDto`, включая:

- `id`
- `externalId`
- `name`
- `createdAt`
- `updatedAt`
- `articleCount`
- `articleIds`

---

## Membership-операции

### `POST /api/collections/{collectionExternalId}/articles/{articleExternalId}`
Добавить статью в коллекцию.

#### Response

`201 Created`

#### Поведение

- если связь уже существует, backend не падает и не создает дубль;
- операция идемпотентна.

### `DELETE /api/collections/{collectionExternalId}/articles/{articleExternalId}`
Удалить статью из коллекции.

#### Response

`204 No Content`

### `GET /api/collections/{externalId}/articles`
Получить список `articleExternalId` внутри коллекции.

#### Response

`200 OK`

```json
["article-1", "article-2"]
```

### `GET /api/articles/{articleExternalId}/collections`
Получить список `collectionExternalId`, в которые входит статья.

#### Response

`200 OK`

```json
["collection-1", "collection-2"]
```

---

## Bulk sync endpoint'ы

## `POST /api/collections/sync`
Массовый sync коллекций из локального состояния frontend.

### Request body

```json
[
  {
    "externalId": "collection-uuid-1",
    "name": "Collection 1"
  },
  {
    "externalId": "collection-uuid-2",
    "name": "Collection 2"
  }
]
```

### Response

`200 OK`

### Реальное поведение backend

- если коллекция с таким `externalId` уже есть у пользователя:
  - новая не создается;
  - имя обновляется, если изменилось;
- если коллекции нет:
  - создается новая коллекция с переданным `externalId`;
- `createdAt` и `updatedAt` frontend не передает;
- эти поля на сервере ведутся автоматически через auditing.

## `POST /api/collections/links/sync`
Массовый sync membership-связей.

### Request body

```json
[
  {
    "externalId": "link-uuid-1",
    "articleExternalId": "article-uuid-1",
    "collectionExternalId": "collection-uuid-1",
    "clientCreatedAt": 1712160000000
  }
]
```

### Response

`200 OK`

### Реальное поведение backend

- если статья не найдена у пользователя:
  - link пропускается;
- если коллекция не найдена у пользователя:
  - link пропускается;
- если link уже существует:
  - новый не создается;
- если link не существует:
  - создается новая запись;
- `clientCreatedAt` необязателен.

Важно: backend сейчас не возвращает список пропущенных link'ов в ответе. Он просто пропускает их и пишет warning в лог.

---

## Какие структуры должен поддерживать Frontend

### Коллекция

Локально frontend по-прежнему может хранить:

```ts
type ArticleCollection = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}
```

Но важно помнить:

- локальный `id` должен совпадать с backend `externalId`;
- для online-created коллекций `id` надо брать из ответа backend;
- для offline-created коллекций `id` генерируется локально и потом уходит в `/api/collections/sync`.

### Membership link

Frontend должен иметь локальную структуру примерно такого вида:

```ts
type ArticleCollectionLink = {
  id: string
  articleId: string
  collectionId: string
  createdAt: number
}
```

Где:

- `id` -> это `CollectionLinkSyncDto.externalId`;
- `articleId` -> это `articleExternalId`;
- `collectionId` -> это `collectionExternalId`;
- `createdAt` -> это `clientCreatedAt`.

---

## Рекомендуемый frontend flow

## 1. Загрузка данных при старте

После логина:

1. получить все коллекции через `GET /api/collections`;
2. сохранить их в IndexedDB;
3. для каждой коллекции вызвать `GET /api/collections/{externalId}/articles`;
4. пересобрать локальные membership-связи;
5. только после этого обновить UI.

Если есть pending локальные изменения:

1. сначала отправить локальные коллекции через `/api/collections/sync`;
2. затем отправить локальные link'и через `/api/collections/links/sync`;
3. затем заново стянуть актуальное состояние с backend;
4. перезаписать локальный кэш серверным состоянием.

## 2. Online create collection

Если сеть доступна:

1. `POST /api/collections`
2. взять `externalId` из ответа;
3. сохранить его как локальный `collection.id`;
4. обновить локальный store.

## 3. Offline create collection

Если сети нет:

1. создать локальную коллекцию;
2. сохранить ее в pending queue;
3. при следующем sync отправить через `/api/collections/sync`.

## 4. Rename collection

Online:

1. `PUT /api/collections/{externalId}`
2. обновить локальную запись ответом backend.

Offline:

- либо временно хранить как pending change;
- либо на этапе 1 разрешить rename только online.

## 5. Add article to collection

Online:

1. `POST /api/collections/{collectionExternalId}/articles/{articleExternalId}`
2. локально обновить membership.

Offline:

1. создать локальный link;
2. положить его в pending links;
3. потом отправить через `/api/collections/links/sync`.

## 6. Remove article from collection

Online:

1. `DELETE /api/collections/{collectionExternalId}/articles/{articleExternalId}`
2. удалить локальный link.

Offline:

На текущем этапе полноценный delete-sync backend не реализован как отдельный bulk-механизм.

Это значит:

- online delete работает;
- offline delete надо либо временно ограничить;
- либо хранить отдельную очередь удалений и обрабатывать ее позже в следующем этапе.

---

## Ограничения текущей backend-реализации

### 1. Нет bulk sync удаления

Есть bulk sync на создание и дообновление состояния, но нет отдельного backend API для массовой синхронизации удалений link'ов или коллекций.

### 2. Нет conflict resolution по времени

Backend не использует клиентские `updatedAt` для принятия решений.

Сейчас поведение такое:

- коллекция с тем же `externalId` обновит `name`;
- link с той же парой `articleExternalId + collectionExternalId` повторно не создастся;
- delete/merge-конфликты надо отдельно продумывать на следующем этапе.

### 3. `GET /api/collections` не возвращает полный payload

Если frontend хочет сразу восстановить содержимое коллекций, одного `GET /api/collections` недостаточно. Нужно дополнительно запрашивать статьи коллекции.

### 4. Skip по отсутствующим данным молчаливый для API

Если frontend отправил link, а статья или коллекция не найдены, backend вернет `200 OK`, но конкретный link не создаст.

Следовательно, frontend после sync должен обязательно делать повторный pull server state, а не считать sync успешным только по HTTP-коду.

---

## Что нужно сделать во Frontend после этого этапа

1. Добавить API-модуль для коллекций под новый backend-контракт.
2. Развести online CRUD и offline bulk sync.
3. Использовать backend `externalId` как основной идентификатор коллекции.
4. Синхронизировать не только коллекции, но и membership-связи.
5. После любого bulk sync делать повторную загрузку server state.
6. Не использовать flow "create locally -> create on server -> sync ту же сущность еще раз".
7. Ограничить или отдельно спроектировать offline delete до следующего этапа.

---

## Файлы Backend, на которые должен ориентироваться Frontend

- `src/main/java/com/emeraldgrove/controller/CollectionController.java`
- `src/main/java/com/emeraldgrove/controller/ArticleController.java`
- `src/main/java/com/emeraldgrove/dto/CollectionDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionRequestDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionSyncDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionLinkSyncDto.java`
- `src/main/java/com/emeraldgrove/service/impl/CollectionServiceImpl.java`

---

## Краткий итог

Backend этапа 1 готов для работы коллекций и синхронизации, но frontend должен подстроиться под несколько важных правил:

- backend теперь хранит canonical state коллекций;
- `externalId` является главным идентификатором для sync;
- membership-связи синхронизируются отдельно;
- после bulk sync нужно заново перечитывать серверное состояние;
- offline delete пока не доведен до полноценного backend sync-механизма.
