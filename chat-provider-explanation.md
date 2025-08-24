# Как работает определение провайдера чата в приложении

## Архитектура системы провайдеров

### Основные компоненты:
- `packages/stage-ui/src/stores/providers.ts` - центральное хранилище всех провайдеров
- `packages/stage-ui/src/stores/modules/consciousness.ts` - управление активным провайдером и моделью
- `apps/stage-tamagotchi/src/pages/settings/modules/consciousness.vue` - интерфейс выбора провайдера

## Как работает выбор провайдера

### В интерфейсе настроек:
- Компонент `consciousness.vue` отображает список настроенных провайдеров чата
- Используется компонент `RadioCardSimple` для выбора провайдера из списка `configuredChatProvidersMetadata`
- После выбора провайдера загружаются доступные модели (если провайдер поддерживает их перечисление)
- Пользователь выбирает модель через компонент `RadioCardManySelect` или вводит название модели вручную

## Фиксация выбора и персистентность

### Сохранение настроек:
- Активный провайдер сохраняется в `useLocalStorage('settings/consciousness/active-provider', '')`
- Активная модель сохраняется в `useLocalStorage('settings/consciousness/active-model', '')`
- Настройки автоматически сохраняются в локальном хранилище браузера и восстанавливаются при перезапуске

## Взаимодействие LLM с чатом

### Процесс отправки сообщения:
1. В `InteractiveArea.vue` функция `handleSend()` получает текущие `activeProvider` и `activeModel`
2. Получается конфигурация провайдера через `providersStore.getProviderConfig(activeProvider.value)`
3. Создается экземпляр провайдера через `providersStore.getProviderInstance<ChatProvider>(activeProvider.value)`
4. Сообщение отправляется через `send()` с указанием модели, провайдера и конфигурации

```typescript
// Пример из InteractiveArea.vue
async function handleSend() {
  const providerConfig = providersStore.getProviderConfig(activeProvider.value)
  await send(messageToSend, {
    model: activeModel.value,
    chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
    providerConfig,
  })
}
```

## Управление провайдерами

### Метаданные провайдеров:
- Каждый провайдер имеет метаданные в `providerMetadata` с информацией о возможностях, валидации, создании экземпляра
- Провайдеры автоматически инициализируются при запуске приложения
- Статус конфигурации отслеживается в реальном времени через `configuredProviders`

### Структура метаданных провайдера:
```typescript
export interface ProviderMetadata {
  id: string
  category: 'chat' | 'embed' | 'speech' | 'transcription'
  nameKey: string // i18n ключ для имени провайдера
  descriptionKey: string // i18n ключ для описания
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>) => Promise<VoiceInfo[]>
    loadModel?: (config: Record<string, unknown>) => Promise<void>
  }
  validators: {
    validateProviderConfig: (config: any) => Promise<ValidationResult> | ValidationResult
  }
  createProvider: (config: Record<string, unknown>) => ChatProvider | Promise<ChatProvider>
}
```

## Ключевые особенности

- **Реактивность**: Все изменения провайдера/модели отслеживаются через Vue reactivity
- **Валидация**: Каждый провайдер имеет функции валидации конфигурации
- **Автозагрузка моделей**: При выборе провайдера автоматически загружается список доступных моделей
- **Проверка доступности**: Система может проверять доступность выбранной модели
- **Персистентность**: Все настройки сохраняются в localStorage и восстанавливаются при перезапуске

## Поддерживаемые провайдеры

Система поддерживает множество провайдеров:
- **Облачные**: OpenAI, Anthropic, Google Generative AI, Azure, Mistral, Perplexity, и др.
- **Локальные**: Ollama, Player2
- **Специализированные**: OpenRouter, Together AI, Workers AI

## Проверка версии

Если у вас отсутствуют последние разработки, проверьте:

```bash
# Проверить текущую ветку
git branch

# Проверить последние коммиты
git log --oneline -10

# Проверить статус
git status

# Обновить до последней версии
git pull origin main
```

Также убедитесь, что вы находитесь на правильной ветке и что все зависимости установлены:

```bash
pnpm install
```

Таким образом, выбор провайдера фиксируется до следующего перезапуска приложения через механизм `useLocalStorage`, а взаимодействие с LLM происходит через унифицированный интерфейс провайдеров с автоматическим управлением конфигурацией и состоянием.
