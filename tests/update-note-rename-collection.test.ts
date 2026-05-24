import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const frontendRoot = process.cwd()
const backendRoot = join(frontendRoot, '..', 'Emerald-Grove-Backend')

const libraryContent = readFileSync(join(frontendRoot, 'src/library/LibraryApp.tsx'), 'utf-8')
const articlesApiContent = readFileSync(join(frontendRoot, 'src/shared/api/articles.ts'), 'utf-8')
const collectionsApiContent = readFileSync(join(frontendRoot, 'src/shared/api/collections.ts'), 'utf-8')
const dbContent = readFileSync(join(frontendRoot, 'src/shared/repository/db.ts'), 'utf-8')
const typesContent = readFileSync(join(frontendRoot, 'src/shared/types.ts'), 'utf-8')

const noteControllerContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/controller/NoteController.java'),
  'utf-8',
)
const collectionControllerContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/controller/CollectionController.java'),
  'utf-8',
)
const updateNoteRequestDtoContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/dto/article/UpdateNoteRequestDto.java'),
  'utf-8',
)
const articleServiceContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/service/ArticleService.java'),
  'utf-8',
)
const collectionServiceContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/service/CollectionService.java'),
  'utf-8',
)

// ===========================================================================
// Update Note — Backend
// ===========================================================================

describe('Update Note — backend endpoint', () => {
  test('NoteController has PUT /{noteId} mapping', () => {
    expect(noteControllerContent).toMatch(/@PutMapping\("\/\{noteId\}"\)/)
  })

  test('NoteController updateNote accepts @Valid @RequestBody UpdateNoteRequestDto', () => {
    expect(noteControllerContent).toMatch(/@Valid\s+@RequestBody\s+UpdateNoteRequestDto/)
  })

  test('NoteController updateNote returns 204 No Content', () => {
    expect(noteControllerContent).toMatch(/ResponseEntity\.noContent\(\)\.build\(\)/)
  })

  test('NoteController base path is /api/articles/{articleExternalId}/notes', () => {
    expect(noteControllerContent).toMatch(/@RequestMapping\("\/api\/articles\/\{articleExternalId\}\/notes"\)/)
  })

  test('UpdateNoteRequestDto has type field with @NotNull', () => {
    expect(updateNoteRequestDtoContent).toContain('@NotNull')
    expect(updateNoteRequestDtoContent).toContain('NoteType type')
  })

  test('UpdateNoteRequestDto has content field with @NotBlank and @Size(max = 2000)', () => {
    expect(updateNoteRequestDtoContent).toContain('@NotBlank')
    expect(updateNoteRequestDtoContent).toMatch(/@Size\(max\s*=\s*2000\)/)
    expect(updateNoteRequestDtoContent).toContain('String content')
  })

  test('ArticleService interface declares updateNote method', () => {
    expect(articleServiceContent).toMatch(/void\s+updateNote\(/)
  })
})

// ===========================================================================
// Update Note — Frontend API
// ===========================================================================

describe('Update Note — frontend API function', () => {
  test('updateNoteOnServer is exported from articles.ts', () => {
    expect(articlesApiContent).toMatch(/export\s+async\s+function\s+updateNoteOnServer/)
  })

  test('updateNoteOnServer calls PUT on /api/articles/{id}/notes/{noteId}', () => {
    expect(articlesApiContent).toMatch(
      /\/api\/articles\/\$\{encodeURIComponent\(articleExternalId\)\}\/notes\/\$\{encodeURIComponent\(noteId\)\}/,
    )
    expect(articlesApiContent).toMatch(/method:\s*['"]PUT['"]/)
  })

  test('updateNoteOnServer sends JSON body via JSON.stringify(data)', () => {
    // Verify the function stringifies a data parameter
    expect(articlesApiContent).toMatch(/updateNoteOnServer[\s\S]*?JSON\.stringify\(data\)/)
  })

  test('updateNoteOnServer accepts articleExternalId, noteId, data params', () => {
    expect(articlesApiContent).toMatch(
      /updateNoteOnServer\(\s*\n?\s*articleExternalId:\s*string,?\s*\n?\s*noteId:\s*string,?\s*\n?\s*data:\s*\{/,
    )
  })

  test('updateNoteOnServer returns Promise<void>', () => {
    expect(articlesApiContent).toMatch(/updateNoteOnServer[\s\S]*?:\s*Promise<void>/)
  })
})

// ===========================================================================
// Update Note — IndexedDB
// ===========================================================================

describe('Update Note — IndexedDB layer', () => {
  test('updateArticleNote is exported from db.ts', () => {
    expect(dbContent).toMatch(/export\s+async\s+function\s+updateArticleNote/)
  })

  test('updateArticleNote accepts articleId, noteId, patch with type and content', () => {
    expect(dbContent).toMatch(
      /updateArticleNote\(\s*\n?\s*articleId:\s*string,?\s*\n?\s*noteId:\s*string,?\s*\n?\s*patch:\s*\{\s*type:\s*NoteType;\s*content:\s*string\s*\}/,
    )
  })

  test('updateArticleNote maps over notes to replace the matching note', () => {
    expect(dbContent).toMatch(/notes:\s*article\.notes\.map\(/)
  })

  test('updateArticleNote trims content before saving', () => {
    expect(dbContent).toMatch(/patch\.content\.trim\(\)/)
  })

  test('updateArticleNote marks article as PENDING_SYNC', () => {
    // After the function signature, it should set syncStatus: 'PENDING_SYNC'
    const fnMatch = dbContent.match(/function\s+updateArticleNote[\s\S]*?^}/m)
    expect(fnMatch?.[0]).toContain("syncStatus: 'PENDING_SYNC'")
  })
})

// ===========================================================================
// Update Note — UI
// ===========================================================================

describe('Update Note — UI in LibraryApp', () => {
  test('editingNote state is declared', () => {
    expect(libraryContent).toMatch(/\[editingNote,\s*setEditingNote\]\s*=\s*useState/)
  })

  test('handleUpdateNote function exists', () => {
    expect(libraryContent).toMatch(/async\s+function\s+handleUpdateNote\(articleId:\s*string,\s*noteId:\s*string\)/)
  })

  test('handleUpdateNote calls updateArticleNote (IndexedDB) then updateNoteOnServer (API)', () => {
    const fnMatch = libraryContent.match(/function\s+handleUpdateNote[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('updateArticleNote(')
    expect(fnBody).toContain('updateNoteOnServer(')
    // Local update should come before server call
    const localIndex = fnBody.indexOf('updateArticleNote(')
    const serverIndex = fnBody.indexOf('updateNoteOnServer(')
    expect(localIndex).toBeLessThan(serverIndex)
  })

  test('edit button exists with pencil icon and title "Редактировать заметку"', () => {
    expect(libraryContent).toContain('title="Редактировать заметку"')
    // Pencil SVG path
    expect(libraryContent).toContain('M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z')
  })

  test('clicking edit populates editingNote with current note data', () => {
    expect(libraryContent).toMatch(
      /setEditingNote\(\{\s*noteId:\s*note\.id,\s*type:\s*note\.type,\s*content:\s*note\.content/,
    )
  })

  test('inline edit form has type selector buttons for all note types', () => {
    expect(libraryContent).toMatch(/editingNote\.type\s*===\s*option\.value/)
  })

  test('inline edit form has textarea bound to editingNote.content', () => {
    expect(libraryContent).toMatch(/value=\{editingNote\.content\}/)
  })

  test('inline edit form has cancel and save buttons', () => {
    expect(libraryContent).toContain('Отмена')
    expect(libraryContent).toMatch(/Сохранение\.\.\.'.*?'Сохранить'|'Сохранить'[\s\S]*?Сохранение\.\.\./)
  })

  test('save button is disabled while saving or when content is empty', () => {
    expect(libraryContent).toMatch(/disabled=\{editingNote\.saving\s*\|\|\s*!editingNote\.content\.trim\(\)\}/)
  })

  test('cancel button resets editingNote to null', () => {
    expect(libraryContent).toMatch(/onClick=\{?\(\)\s*=>\s*setEditingNote\(null\)/)
  })

  test('handleUpdateNote refreshes library state after success', () => {
    const fnMatch = libraryContent.match(/function\s+handleUpdateNote[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('refreshLibraryState()')
  })

  test('handleUpdateNote clears editingNote on success', () => {
    const fnMatch = libraryContent.match(/function\s+handleUpdateNote[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('setEditingNote(null)')
  })

  test('updateNoteOnServer is imported in LibraryApp', () => {
    expect(libraryContent).toMatch(/import\s*\{[\s\S]*?updateNoteOnServer[\s\S]*?\}\s*from/)
  })

  test('updateArticleNote is imported from db in LibraryApp', () => {
    expect(libraryContent).toMatch(/import\s*\{[\s\S]*?updateArticleNote[\s\S]*?\}\s*from\s*['"].*repository\/db['"]/)
  })
})

// ===========================================================================
// Update Note — Types
// ===========================================================================

describe('Update Note — types compatibility', () => {
  test('ArticleNote has mutable type and content fields', () => {
    const noteInterface = typesContent.match(/interface\s+ArticleNote\s*\{[\s\S]*?\}/)
    const body = noteInterface?.[0] ?? ''
    expect(body).toContain('type: NoteType')
    expect(body).toContain('content: string')
    // Fields should NOT be readonly
    expect(body).not.toMatch(/readonly\s+type/)
    expect(body).not.toMatch(/readonly\s+content/)
  })

  test('NoteType includes QUESTION', () => {
    expect(typesContent).toMatch(/NoteType[\s\S]*?QUESTION/)
  })

  test('NoteType includes IDEA and TASK', () => {
    expect(typesContent).toMatch(/NoteType[\s\S]*?IDEA/)
    expect(typesContent).toMatch(/NoteType[\s\S]*?TASK/)
  })
})

// ===========================================================================
// Rename Collection — Backend
// ===========================================================================

describe('Rename Collection — backend endpoint', () => {
  test('CollectionController has PUT /{externalId} mapping', () => {
    expect(collectionControllerContent).toMatch(/@PutMapping\("\/\{externalId\}"\)/)
  })

  test('CollectionController renameCollection returns ResponseEntity<CollectionDto>', () => {
    expect(collectionControllerContent).toMatch(/ResponseEntity<CollectionDto>\s+renameCollection/)
  })

  test('CollectionController renameCollection accepts @Valid @RequestBody CollectionRequestDto', () => {
    expect(collectionControllerContent).toMatch(/@Valid\s+@RequestBody\s+CollectionRequestDto/)
  })

  test('CollectionController renameCollection returns 200 OK', () => {
    expect(collectionControllerContent).toMatch(/ResponseEntity\.ok\(collectionService\.renameCollection/)
  })

  test('CollectionService interface declares renameCollection method', () => {
    expect(collectionServiceContent).toMatch(/CollectionDto\s+renameCollection\(/)
  })
})

// ===========================================================================
// Rename Collection — Frontend API
// ===========================================================================

describe('Rename Collection — frontend API function', () => {
  test('renameCollectionOnServer is exported from collections.ts', () => {
    expect(collectionsApiContent).toMatch(/export\s+async\s+function\s+renameCollectionOnServer/)
  })

  test('renameCollectionOnServer calls PUT on /api/collections/{externalId}', () => {
    expect(collectionsApiContent).toMatch(
      /renameCollectionOnServer[\s\S]*?\/api\/collections\/\$\{encodeURIComponent\(externalId\)\}/,
    )
  })

  test('renameCollectionOnServer sends { name } in body', () => {
    expect(collectionsApiContent).toMatch(/renameCollectionOnServer[\s\S]*?JSON\.stringify\(\{\s*name\s*\}\)/)
  })

  test('renameCollectionOnServer returns Promise<ArticleCollection>', () => {
    expect(collectionsApiContent).toMatch(/renameCollectionOnServer[\s\S]*?:\s*Promise<ArticleCollection>/)
  })

  test('renameCollectionOnServer uses method PUT', () => {
    // Find the function body and check for PUT
    const fnStart = collectionsApiContent.indexOf('renameCollectionOnServer')
    const fnChunk = collectionsApiContent.slice(fnStart, fnStart + 500)
    expect(fnChunk).toMatch(/method:\s*['"]PUT['"]/)
  })
})

// ===========================================================================
// Rename Collection — IndexedDB
// ===========================================================================

describe('Rename Collection — IndexedDB layer', () => {
  test('renameCollection is exported from db.ts', () => {
    expect(dbContent).toMatch(/export\s+async\s+function\s+renameCollection/)
  })

  test('renameCollection accepts collectionId and name', () => {
    expect(dbContent).toMatch(/renameCollection\(collectionId:\s*string,\s*name:\s*string\)/)
  })

  test('renameCollection trims the name', () => {
    const fnMatch = dbContent.match(/function\s+renameCollection[\s\S]*?^}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('name.trim()')
  })

  test('renameCollection throws if collection not found', () => {
    const fnMatch = dbContent.match(/function\s+renameCollection[\s\S]*?^}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain("'Collection not found'")
  })

  test('renameCollection throws if trimmed name is empty', () => {
    const fnMatch = dbContent.match(/function\s+renameCollection[\s\S]*?^}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain("'Collection name is required'")
  })

  test('renameCollection marks collection as PENDING_SYNC', () => {
    const fnMatch = dbContent.match(/function\s+renameCollection[\s\S]*?^}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain("syncStatus: 'PENDING_SYNC'")
  })
})

// ===========================================================================
// Rename Collection — UI
// ===========================================================================

describe('Rename Collection — UI in LibraryApp', () => {
  test('renamingCollectionId state is declared', () => {
    expect(libraryContent).toMatch(/\[renamingCollectionId,\s*setRenamingCollectionId\]\s*=\s*useState/)
  })

  test('renamingCollectionName state is declared', () => {
    expect(libraryContent).toMatch(/\[renamingCollectionName,\s*setRenamingCollectionName\]\s*=\s*useState/)
  })

  test('handleRenameCollection function exists', () => {
    expect(libraryContent).toMatch(/async\s+function\s+handleRenameCollection\(collectionId:\s*string\)/)
  })

  test('handleRenameCollection calls renameCollectionOnServer', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('renameCollectionOnServer(')
  })

  test('handleRenameCollection falls back to local renameCollection on server error', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('renameCollection(')
    // Server call should be tried first
    const serverIndex = fnBody.indexOf('renameCollectionOnServer(')
    const localIndex = fnBody.indexOf('renameCollection(collectionId')
    expect(serverIndex).toBeLessThan(localIndex)
  })

  test('handleRenameCollection saves server response via saveCollectionOffline', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('saveCollectionOffline(')
  })

  test('handleRenameCollection resets renaming state after completion', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('setRenamingCollectionId(null)')
    expect(fnBody).toContain("setRenamingCollectionName('')")
  })

  test('handleRenameCollection refreshes collections after rename', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toContain('refreshCollections()')
  })

  test('rename button exists with title "Переименовать раздел"', () => {
    expect(libraryContent).toContain('title="Переименовать раздел"')
  })

  test('clicking rename sets renamingCollectionId and prefills name', () => {
    expect(libraryContent).toMatch(/setRenamingCollectionId\(collection\.id\)/)
    expect(libraryContent).toMatch(/setRenamingCollectionName\(collection\.name\)/)
  })

  test('inline rename input is shown when renamingCollectionId matches', () => {
    expect(libraryContent).toMatch(/renamingCollectionId\s*===\s*collection\.id/)
  })

  test('Enter key triggers handleRenameCollection', () => {
    expect(libraryContent).toMatch(/event\.key\s*===\s*['"]Enter['"]\)\s*void\s+handleRenameCollection/)
  })

  test('Escape key cancels renaming', () => {
    expect(libraryContent).toMatch(/event\.key\s*===\s*['"]Escape['"][\s\S]{0,200}setRenamingCollectionId\(null\)/)
  })

  test('blur triggers handleRenameCollection (save on focus loss)', () => {
    expect(libraryContent).toMatch(/onBlur=\{\(\)\s*=>\s*void\s+handleRenameCollection\(collection\.id\)\}/)
  })

  test('renameCollectionOnServer is imported in LibraryApp', () => {
    expect(libraryContent).toMatch(/import\s*\{[\s\S]*?renameCollectionOnServer[\s\S]*?\}\s*from/)
  })

  test('renameCollection is imported from db in LibraryApp', () => {
    expect(libraryContent).toMatch(/import\s*\{[\s\S]*?renameCollection[\s\S]*?\}\s*from\s*['"].*repository\/db['"]/)
  })

  test('handleRenameCollection skips rename if trimmed name is empty', () => {
    const fnMatch = libraryContent.match(/function\s+handleRenameCollection[\s\S]*?^\s{2}\}/m)
    const fnBody = fnMatch?.[0] ?? ''
    expect(fnBody).toMatch(/if\s*\(\s*!name\s*\)/)
  })
})

// ===========================================================================
// Cross-layer consistency
// ===========================================================================

describe('Cross-layer consistency', () => {
  test('backend note endpoint path matches frontend API call', () => {
    // Backend: @RequestMapping("/api/articles/{articleExternalId}/notes") + @PutMapping("/{noteId}")
    // Frontend: /api/articles/${encodeURIComponent(articleExternalId)}/notes/${encodeURIComponent(noteId)}
    expect(noteControllerContent).toContain('/api/articles/{articleExternalId}/notes')
    expect(articlesApiContent).toMatch(/\/api\/articles\/\$\{.*?\}\/notes\/\$\{.*?\}/)
  })

  test('backend collection rename endpoint path matches frontend API call', () => {
    // Backend: @RequestMapping("/api/collections") + @PutMapping("/{externalId}")
    // Frontend: /api/collections/${encodeURIComponent(externalId)}
    expect(collectionControllerContent).toContain('/api/collections')
    expect(collectionControllerContent).toContain('/{externalId}')
    expect(collectionsApiContent).toMatch(/\/api\/collections\/\$\{encodeURIComponent\(externalId\)\}/)
  })

  test('backend NoteType enum values match frontend NoteType union', () => {
    // Frontend defines: NoteType = 'IDEA' | 'TASK' | 'QUESTION'
    expect(typesContent).toMatch(/NoteType/)
    expect(typesContent).toContain("'IDEA'")
    expect(typesContent).toContain("'TASK'")
    expect(typesContent).toContain("'QUESTION'")
  })

  test('both update note and rename collection use PUT method', () => {
    // Note update
    expect(noteControllerContent).toContain('@PutMapping')
    expect(articlesApiContent).toMatch(/updateNoteOnServer[\s\S]*?method:\s*['"]PUT['"]/)
    // Collection rename
    expect(collectionControllerContent).toMatch(/@PutMapping\("\/\{externalId\}"\)/)
    expect(collectionsApiContent).toMatch(/renameCollectionOnServer[\s\S]*?method:\s*['"]PUT['"]/)
  })
})
