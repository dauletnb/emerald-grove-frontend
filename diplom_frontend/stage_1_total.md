## Что важно понимать для frontend после backend-этапа 1

После завершения этапа 1 backend уже хранит не только коллекции и связи, но и пользовательские article-флаги:

- `isFavorite`
- `isReadLater`

Это меняет frontend-контракт: после успешного article sync именно backend считается актуальным источником истины по этим полям.

---

## Критичные выводы для frontend

### 1. Backend теперь canonical source of truth для article flags после sync

Frontend может продолжать использовать IndexedDB:

- как локальный кэш;
- как offline-слой;
- как очередь pending-изменений.

Но после успешного sync:

- `isFavorite` и `isReadLater` должны считаться серверными полями;
- локальное состояние нужно обновлять из ответа backend или из повторного `GET /api/articles`;
- нельзя продолжать восстанавливать эти флаги только из локальной IndexedDB-логики, игнорируя backend.

### 2. Контракт article sync изменился

Теперь `POST /api/articles/sync` принимает и сохраняет:

- `isFavorite`
- `isReadLater`

И в ответе sync backend возвращает не `payload`, а поле:

- `article`

То есть frontend, который читает `response.payload`, будет расходиться с текущим backend-контрактом.

### 3. `GET /api/articles` теперь возвращает article flags

Frontend больше не должен считать, что список статей с сервера не содержит этих полей.

После backend-изменений `GET /api/articles` возвращает:

- `isFavorite`
- `isReadLater`

для каждой статьи.

### 4. Коллекции и membership-связи по-прежнему синхронизируются отдельно

Эта часть не изменилась:

- коллекции синхронизируются отдельно;
- membership-связи `articleExternalId <-> collectionExternalId` синхронизируются отдельно.

То есть перенос article flags в backend не отменяет отдельный sync для collections/links.

---

## Реально доступные article endpoints backend после этапа 1

Все endpoints требуют авторизацию, как и остальные `/api/**`.

### `POST /api/articles/sync`

Синхронизировать одну статью.

#### Request body

```json
{
  "externalId": "article-uuid-1",
  "url": "https://example.com/article",
  "title": "Interesting article",
  "description": "Short description",
  "isFavorite": true,
  "isReadLater": false,
  "notes": []
}
```

#### Response

`201 Created` или `200 OK` в зависимости от `status`.

```json
{
  "status": "CREATED",
  "articleId": 42,
  "article": {
    "articleId": 42,
    "externalId": "article-uuid-1",
    "url": "https://example.com/article",
    "title": "Interesting article",
    "description": "Short description",
    "isFavorite": true,
    "isReadLater": false,
    "createdAt": 1712160000000,
    "updatedAt": 1712160005000,
    "aiStatus": "PENDING",
    "notes": []
  }
}
```

#### Важно для frontend

- читать надо `response.article`, а не `response.payload`;
- если статья уже есть, backend обновит `title`, `url`, `description`, `isFavorite`, `isReadLater`;
- если `externalId` пустой, backend пытается найти статью по `url + userId`;
- после online sync локальную статью лучше перезаписывать серверным snapshot из `response.article`.

### `GET /api/articles`

Получить все статьи пользователя.

#### Response

`200 OK`

```json
[
  {
    "articleId": 42,
    "externalId": "article-uuid-1",
    "url": "https://example.com/article",
    "title": "Interesting article",
    "description": "Short description",
    "isFavorite": true,
    "isReadLater": false,
    "createdAt": 1712160000000,
    "updatedAt": 1712160005000,
    "aiStatus": "PENDING",
    "notes": []
  }
]
```

#### Важно для frontend

- `isFavorite` и `isReadLater` уже приходят с backend;
- не нужно вычислять эти поля только локально поверх server response;
- после sync лучше делать повторный pull server state, если есть риск silent skip или частичного расхождения в других сущностях.

### `DELETE /api/articles/{externalId}`

Удалить статью.

#### Response

`204 No Content`

### `DELETE /api/articles/{externalId}/notes/{noteId}`

Удалить заметку статьи.

#### Response

`204 No Content`

### `GET /api/articles/{externalId}/ai`

Получить AI-результат статьи.

#### Response

`200 OK`

Возвращает:

- `aiStatus`
- `content`

### `POST /api/articles/{externalId}/ai/retry`

Повторить AI-анализ.

#### Response

`202 Accepted`

### `GET /api/articles/{articleExternalId}/collections`

Получить список `collectionExternalId`, в которые входит статья.

#### Response

`200 OK`

```json
["collection-1", "collection-2"]
```

---

## Какие структуры должен поддерживать frontend

### Article

После backend-этапа 1 frontend-модель статьи должна быть совместима как минимум с таким shape:

```ts
type Article = {
  id: string
  url: string
  title: string
  description?: string
  isFavorite: boolean
  isReadLater: boolean
  createdAt?: number
  updatedAt?: number
  aiStatus?: string
  notes: ArticleNote[]
}
```

Где:

- локальный `id` должен совпадать с backend `externalId`;
- `isFavorite` и `isReadLater` должны участвовать и в локальном store, и в sync DTO;
- после sync эти поля должны обновляться серверным значением.

### Article sync request

Frontend при отправке статьи должен формировать body, совместимый с `SyncArticleRequestDto`:

```ts
type SyncArticleRequest = {
  externalId?: string
  url: string
  title: string
  description?: string
  isFavorite: boolean
  isReadLater: boolean
  notes: SyncArticleNoteRequest[]
}
```

Если frontend не отправит `isFavorite` или `isReadLater`, для boolean-полей это фактически приведёт к `false`, что может случайно стереть локальное состояние пользователя.

Поэтому для frontend это обязательные рабочие поля, даже если в TypeScript они раньше были опциональными.

### Article sync response

Frontend должен читать ответ sync так:

```ts
type SyncArticleResponse = {
  status: 'CREATED' | 'UPDATED'
  articleId: number
  article: {
    articleId: number
    externalId: string
    url: string
    title: string
    description?: string
    isFavorite: boolean
    isReadLater: boolean
    createdAt?: number
    updatedAt?: number
    aiStatus?: string
    notes: SyncArticleNoteResponse[]
  }
}
```

Критично:

- поле называется `article`;
- не `payload`;
- после sync именно этот snapshot лучше класть в локальное хранилище.

### Collection

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

## Что нужно поправить во frontend, если он ещё живёт по старому контракту

### 1. Обновить article API client

Нужно поправить:

- request body для `POST /api/articles/sync`;
- response parsing для `SyncArticleResponseDto`;
- тип ответа `GET /api/articles`.

Минимально:

- добавь в sync request поля `isFavorite` и `isReadLater`;
- читай `response.article`, а не `response.payload`;
- ожидай флаги в `GET /api/articles`.

### 2. Убрать frontend-only источник истины для favorite/read later после sync

Если сейчас frontend:

- хранит `isFavorite` и `isReadLater` только в IndexedDB;
- а после загрузки с backend восстанавливает эти поля отдельным merge;

то это уже устаревшее поведение.

Теперь правильнее:

1. читать статьи с сервера вместе с флагами;
2. локально кэшировать их;
3. при изменении флага отправлять обновлённую статью в sync;
4. после успешного sync перезаписывать локальную запись серверным snapshot.

### 3. Сделать boolean-поля обязательными в frontend-модели sync

Если во frontend они ещё описаны как:

```ts
isFavorite?: boolean
isReadLater?: boolean
```

то для sync-слоя лучше перевести их в обязательные:

```ts
isFavorite: boolean
isReadLater: boolean
```

Иначе можно незаметно отправить `false` по умолчанию там, где frontend ожидал “поле просто отсутствует”.

### 4. Не смешивать старый merge-флоу с новым серверным контрактом

Плохой вариант после текущих backend-изменений:

1. получить статью с backend;
2. поверх неё принудительно подмешать старые локальные `isFavorite`/`isReadLater`;
3. считать это более правильным состоянием.

Это снова ломает backend как source of truth.

Если есть pending offline-изменения, их нужно синхронизировать явно, а не silently поверх server response.

---

## Коллекции и links: что остаётся актуальным без изменений

### Коллекции

- online create: `POST /api/collections`
- online rename: `PUT /api/collections/{externalId}`
- online delete: `DELETE /api/collections/{externalId}`
- pull all: `GET /api/collections`
- offline bulk sync: `POST /api/collections/sync`

### Membership links

- online add article to collection: `POST /api/collections/{collectionExternalId}/articles/{articleExternalId}`
- online remove article from collection: `DELETE /api/collections/{collectionExternalId}/articles/{articleExternalId}`
- pull collection article ids: `GET /api/collections/{externalId}/articles`
- pull article collection ids: `GET /api/articles/{articleExternalId}/collections`
- offline bulk sync links: `POST /api/collections/links/sync`

### Ограничения, которые всё ещё остаются

- нет bulk sync удаления статей;
- нет bulk sync удаления collections/links;
- нет conflict resolution по клиентским временным меткам;
- после bulk sync нужен повторный pull server state;
- skip по отсутствующим сущностям всё ещё может быть “молчаливым” для API.

---

## Рекомендуемый frontend flow после этапа 1

## 1. Загрузка данных при старте

После логина:

1. получить статьи через `GET /api/articles`;
2. сохранить их в IndexedDB вместе с `isFavorite` и `isReadLater`;
3. получить все коллекции через `GET /api/collections`;
4. для каждой коллекции вызвать `GET /api/collections/{externalId}/articles`;
5. пересобрать локальные membership-связи;
6. только после этого обновить UI.

### Если есть pending локальные изменения

1. сначала отправить pending article sync;
2. затем отправить локальные коллекции через `/api/collections/sync`;
3. затем отправить локальные links через `/api/collections/links/sync`;
4. затем заново стянуть актуальное server state;
5. перезаписать локальный кэш серверным состоянием.

## 2. Переключение favorite/read later online

Если сеть доступна:

1. локально обновить статью optimistically;
2. отправить `POST /api/articles/sync` со всеми обязательными полями статьи, включая `isFavorite` и `isReadLater`;
3. заменить локальную запись ответом `response.article`.

## 3. Переключение favorite/read later offline

Если сети нет:

1. локально обновить статью;
2. сохранить изменение в pending queue;
3. при следующем sync отправить статью через `POST /api/articles/sync`;
4. после успешного sync перезаписать локальную запись серверным snapshot.

## 4. Online create collection

1. `POST /api/collections`
2. взять `externalId` из ответа;
3. сохранить его как локальный `collection.id`;
4. обновить локальный store.

## 5. Offline create collection

1. создать локальную коллекцию;
2. сохранить её в pending queue;
3. при следующем sync отправить через `/api/collections/sync`.

---

## Что нужно сделать во frontend прямо сейчас

1. Обновить типы статьи и sync DTO под обязательные `isFavorite` и `isReadLater`.
2. Исправить чтение ответа article sync: использовать `response.article`.
3. Обновить маппинг `GET /api/articles`, чтобы брать флаги прямо из backend response.
4. Убрать старую логику, где favorite/read later после sync восстанавливаются только из локального слоя.
5. Сохранить текущую коллекционную схему sync без изменений.

---

## Backend-файлы, на которые должен ориентироваться frontend

- `src/main/java/com/emeraldgrove/controller/ArticleController.java`
- `src/main/java/com/emeraldgrove/dto/SyncArticleRequestDto.java`
- `src/main/java/com/emeraldgrove/dto/SyncArticleResponseDto.java`
- `src/main/java/com/emeraldgrove/dto/SyncArticlePayloadResponseDto.java`
- `src/main/java/com/emeraldgrove/dto/ArticleSyncDto.java`
- `src/main/java/com/emeraldgrove/controller/CollectionController.java`
- `src/main/java/com/emeraldgrove/dto/CollectionDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionRequestDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionSyncDto.java`
- `src/main/java/com/emeraldgrove/dto/CollectionLinkSyncDto.java`
- `src/main/java/com/emeraldgrove/service/impl/ArticleServiceImpl.java`
- `src/main/java/com/emeraldgrove/service/impl/CollectionServiceImpl.java`

---

## Краткий итог

После backend-этапа 1 frontend должен считать, что:

- backend уже хранит `isFavorite` и `isReadLater`;
- `POST /api/articles/sync` должен отправлять эти поля;
- ответ sync читается из `response.article`;
- `GET /api/articles` уже возвращает эти флаги;
- локальный offline-слой остаётся, но после sync серверное состояние приоритетнее;
- collections и membership-links продолжают жить по отдельному sync-потоку.
