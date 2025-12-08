const STORAGE_KEY = 'koreanFlashcards';
const TAG_STORAGE_KEY = 'koreanFlashcardTags';

const elements = {
  modeSelect: document.getElementById('modeSelect'),
  excludeChecked: document.getElementById('excludeChecked'),
  tagFilterContainer: document.getElementById('tagFilterContainer'),
  tagFilterToggle: document.getElementById('tagFilterToggle'),
  tagFilterSummary: document.getElementById('tagFilterSummary'),
  studyPanel: document.getElementById('studyPanel'),
  managePanel: document.getElementById('managePanel'),
  manageOverlay: document.getElementById('manageOverlay'),
  openManagePanelButton: document.getElementById('openManagePanel'),
  closeManagePanelButton: document.getElementById('closeManagePanel'),
  card: document.getElementById('card'),
  frontText: document.getElementById('frontText'),
  backText: document.getElementById('backText'),
  frontNote: document.getElementById('frontNote'),
  backMemo: document.getElementById('backMemo'),
  cardCounter: document.getElementById('cardCounter'),
  frontHint: document.getElementById('frontHint'),
  hintMask: document.querySelector('#frontHint .hint-mask'),
  hintText: document.querySelector('#frontHint .hint-text'),
  backTags: document.getElementById('backTags'),
  cardTags: document.getElementById('cardTags'),
  checkButton: document.getElementById('checkButton'),
  editButton: document.getElementById('editButton'),
  deleteButton: document.getElementById('deleteButton'),
  frontSpeak: document.getElementById('frontSpeak'),
  backSpeak: document.getElementById('backSpeak'),
  prevCard: document.getElementById('prevCard'),
  nextCard: document.getElementById('nextCard'),
  toggleSide: document.getElementById('toggleSide'),
  emptyMessage: document.getElementById('emptyMessage'),
  resetProgress: document.getElementById('resetProgress'),
  cardForm: document.getElementById('cardForm'),
  cardId: document.getElementById('cardId'),
  frontInput: document.getElementById('frontInput'),
  backInput: document.getElementById('backInput'),
  frontNoteInput: document.getElementById('frontNoteInput'),
  frontHintInput: document.getElementById('frontHintInput'),
  backMemoInput: document.getElementById('backMemoInput'),
  cancelEdit: document.getElementById('cancelEdit'),
  cardList: document.getElementById('cardList'),
  totalCards: document.getElementById('totalCards'),
  cardRowTemplate: document.getElementById('cardRowTemplate'),
  newTagInput: document.getElementById('newTagInput'),
  addTagButton: document.getElementById('addTagButton'),
  cardTagOptions: document.getElementById('cardTagOptions'),
  exportData: document.getElementById('exportData'),
  importData: document.getElementById('importData'),
  importInput: document.getElementById('importInput'),
};

let cards = [];
let tagLibrary = [];
let activeCardIds = [];
let currentIndex = 0;
let showingBack = false;
let selectedFilters = new Set();
let tagFilterMenuOpen = false;
let managePanelOpen = false;

const speechState = {
  voices: [],
  listening: false,
  voiceReadyPromise: null,
  preferredVoiceName: 'yuna',
};

const SAMPLE_DATA = [
  {
    id: crypto.randomUUID?.() ?? `card-${Date.now()}`,
    frontText: '안녕하세요',
    backText: 'こんにちは',
    frontNote: '丁寧な挨拶',
    frontHint: '初対面の挨拶はこれでOK',
    backMemo: '親しい相手にも使える定番表現',
    tags: ['あいさつ'],
    checked: false,
    createdAt: Date.now(),
  },
  {
    id: `card-${Date.now() + 1}`,
    frontText: '어디에 가요?',
    backText: 'どこに行きますか？',
    frontNote: '旅行会話',
    frontHint: '어디=どこ / 가다=行く',
    backMemo: '語尾-에 가요? で「〜に行きますか」',
    tags: ['旅行', '質問'],
    checked: false,
    createdAt: Date.now() + 1,
  },
  {
    id: `card-${Date.now() + 2}`,
    frontText: '괜찮아요',
    backText: '大丈夫です／問題ありません',
    frontNote: '感謝にも返答にも',
    frontHint: '謝罪にも返答にも使える',
    backMemo: '様々な場面で万能',
    tags: ['便利表現'],
    checked: false,
    createdAt: Date.now() + 2,
  },
];

const normalizeCard = (card, index = 0) => ({
  id: card.id || `card-${Date.now()}-${index}`,
  frontText: card.frontText || '',
  backText: card.backText || '',
  frontNote: card.frontNote ?? card.frontMemo ?? '',
  frontHint: card.frontHint ?? '',
  backMemo: card.backMemo ?? '',
  tags: Array.isArray(card.tags) ? card.tags : [],
  checked: Boolean(card.checked),
  createdAt: card.createdAt ?? Date.now() + index,
});

const loadData = () => {
  const savedCards = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const savedTags = JSON.parse(localStorage.getItem(TAG_STORAGE_KEY) || 'null');

  if (Array.isArray(savedCards) && savedCards.length) {
    cards = savedCards.map((card, index) => normalizeCard(card, index));
  } else {
    cards = SAMPLE_DATA.map((card, index) => normalizeCard(card, index));
    persistCards();
  }

  if (Array.isArray(savedTags) && savedTags.length) {
    tagLibrary = savedTags;
  } else {
    tagLibrary = Array.from(new Set(cards.flatMap((c) => c.tags)));
    persistTags();
  }

  syncTagsFromCards();
};

const persistCards = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
};

const persistTags = () => {
  localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(tagLibrary));
};

const syncTagsFromCards = () => {
  const all = new Set(tagLibrary);
  cards.forEach((card) => card.tags.forEach((tag) => all.add(tag)));
  tagLibrary = Array.from(all);
  persistTags();
};

const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const updateActiveCards = () => {
  const filtered = cards.filter((card) => {
    if (elements.excludeChecked.checked && card.checked) {
      return false;
    }
    if (selectedFilters.size === 0) {
      return true;
    }
    return Array.from(selectedFilters).every((tag) => card.tags.includes(tag));
  });

  const ids = filtered.map((card) => card.id);
  activeCardIds = elements.modeSelect.value === 'random' ? shuffle(ids) : ids;

  if (currentIndex >= activeCardIds.length) {
    currentIndex = 0;
  }

  if (activeCardIds.length === 0) {
    elements.card.classList.add('empty');
    showingBack = false;
  } else {
    elements.card.classList.remove('empty');
  }

  renderCard();
  renderCardList();
};

const currentCard = () => cards.find((card) => card.id === activeCardIds[currentIndex]);

const renderCard = () => {
  const card = currentCard();
  const total = activeCardIds.length;
  const position = total ? currentIndex + 1 : 0;
  elements.cardCounter.textContent = `${position} / ${total}`;

  if (!card) {
    elements.frontText.textContent = 'カードがありません';
    elements.backText.textContent = '';
    elements.frontNote.textContent = '';
    elements.backMemo.textContent = '';
    if (elements.cardTags) {
      elements.cardTags.textContent = '';
    }
    elements.backTags.innerHTML = '';
    elements.frontHint.classList.remove('revealed');
    elements.hintText.textContent = '';
    elements.checkButton.disabled = true;
    elements.editButton.disabled = true;
    elements.deleteButton.disabled = true;
    return;
  }

  elements.checkButton.disabled = false;
  elements.editButton.disabled = false;
  elements.deleteButton.disabled = false;
  elements.frontText.textContent = card.frontText;
  elements.backText.textContent = card.backText;
  const frontNoteText = (card.frontNote || '').trim();
  const backMemoText = (card.backMemo || '').trim();
  elements.frontNote.textContent = frontNoteText;
  elements.frontNote.classList.toggle('hidden', !frontNoteText);
  elements.backMemo.textContent = backMemoText;
  elements.backMemo.classList.toggle('hidden', !backMemoText);
  elements.hintText.textContent = card.frontHint || 'ヒントは設定されていません';
  elements.frontHint.classList.toggle('hidden', !card.frontHint);
  elements.frontHint.classList.toggle('revealed', false);
  if (elements.cardTags) {
    elements.cardTags.textContent = card.tags.length ? `タグ: ${card.tags.join(', ')}` : '';
  }
  elements.backTags.innerHTML = card.tags
    .map((tag) => `<span>#${tag}</span>`)
    .join('');
  elements.checkButton.textContent = card.checked ? '✓ 覚えた' : '覚えた！';
  elements.checkButton.classList.toggle('checked', card.checked);

  elements.card.classList.toggle('show-back', showingBack);
};

const resetForm = () => {
  elements.cardId.value = '';
  elements.cardForm.reset();
  Array.from(elements.cardTagOptions.querySelectorAll('input')).forEach((input) => {
    input.checked = false;
  });
};

const openManagePanel = () => {
  if (managePanelOpen) return;
  managePanelOpen = true;
  elements.manageOverlay.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    elements.managePanel?.focus();
  });
};

const closeManagePanel = () => {
  if (!managePanelOpen) return;
  managePanelOpen = false;
  elements.manageOverlay.hidden = true;
  document.body.classList.remove('modal-open');
  resetForm();
};

const focusManageForm = () => {
  requestAnimationFrame(() => {
    elements.frontInput?.focus();
  });
};
const refreshVoices = () => {
  if (!window.speechSynthesis) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length) {
    speechState.voices = list;
  }
  return list;
};

const subscribeVoiceChanges = () => {
  if (!window.speechSynthesis || speechState.listening) return;
  speechState.listening = true;
  refreshVoices();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
};

const waitForVoices = () => {
  if (!window.speechSynthesis) return Promise.resolve([]);
  if (speechState.voices.length) return Promise.resolve(speechState.voices);
  if (!speechState.voiceReadyPromise) {
    speechState.voiceReadyPromise = new Promise((resolve) => {
      const attempt = () => {
        const list = refreshVoices();
        if (list.length) {
          speechState.voiceReadyPromise = null;
          resolve(list);
          return true;
        }
        return false;
      };

      if (attempt()) return;

      const timer = setInterval(() => {
        if (attempt()) {
          clearInterval(timer);
        }
      }, 150);

      setTimeout(() => {
        clearInterval(timer);
        speechState.voiceReadyPromise = null;
        resolve(speechState.voices);
      }, 1500);
    });
  }

  return speechState.voiceReadyPromise;
};

const getVoiceForLang = (lang) => {
  if (!speechState.voices.length) return null;
  const normalized = lang.toLowerCase();
  const base = normalized.split('-')[0];

  if (normalized === 'ko-kr' && speechState.preferredVoiceName) {
    const preferred = speechState.voices.find(
      (voice) =>
        voice.lang?.toLowerCase() === normalized &&
        voice.name?.toLowerCase().includes(speechState.preferredVoiceName)
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    speechState.voices.find((voice) => voice.lang?.toLowerCase() === normalized) ||
    speechState.voices.find((voice) => voice.lang?.toLowerCase().startsWith(base)) ||
    null
  );
};

const speakText = async (text, lang = 'ko-KR') => {
  if (!window.speechSynthesis || !text) return;
  subscribeVoiceChanges();

  try {
    await waitForVoices();
  } catch (error) {
    // iOS Safari などで voice リストの取得に失敗するケースでも、
    // 既定音声での読み上げを試みられるように握り潰す
    console.warn('音声リストの取得に失敗しました', error);
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.pitch = 1;
  utterance.rate = 1;
  const voice = getVoiceForLang(lang);
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.cancel();
  if (typeof window.speechSynthesis.resume === 'function') {
    window.speechSynthesis.resume();
  }
  window.speechSynthesis.speak(utterance);
};

const toggleSide = () => {
  if (!activeCardIds.length) return;
  showingBack = !showingBack;
  elements.card.classList.toggle('show-back', showingBack);
};

const goTo = (direction) => {
  if (!activeCardIds.length) return;
  currentIndex = (currentIndex + direction + activeCardIds.length) % activeCardIds.length;
  showingBack = false;
  renderCard();
};

const updateTagFilterSummary = () => {
  if (!tagLibrary.length) {
    elements.tagFilterSummary.textContent = 'タグ未登録';
    return;
  }

  if (!selectedFilters.size) {
    elements.tagFilterSummary.textContent = 'すべてのタグ';
    return;
  }

  const tags = Array.from(selectedFilters);
  if (tags.length <= 2) {
    elements.tagFilterSummary.textContent = tags.join(' / ');
  } else {
    const [first, second] = tags;
    elements.tagFilterSummary.textContent = `${first} / ${second} 他${tags.length - 2}件`;
  }
};

const closeTagFilterMenu = () => {
  tagFilterMenuOpen = false;
  elements.tagFilterContainer.hidden = true;
  elements.tagFilterToggle.setAttribute('aria-expanded', 'false');
};

const openTagFilterMenu = () => {
  if (!tagLibrary.length) return;
  tagFilterMenuOpen = true;
  elements.tagFilterContainer.hidden = false;
  elements.tagFilterToggle.setAttribute('aria-expanded', 'true');
};

const toggleTagFilterMenu = () => {
  if (!tagLibrary.length) return;
  if (tagFilterMenuOpen) {
    closeTagFilterMenu();
  } else {
    openTagFilterMenu();
  }
};

const renderTagFilters = () => {
  if (!tagLibrary.length) {
    elements.tagFilterContainer.innerHTML = '<p class="small">タグはまだ登録されていません</p>';
    elements.cardTagOptions.innerHTML = '<p class="small">タグを追加して選択できます</p>';
    elements.tagFilterToggle.disabled = true;
    selectedFilters.clear();
    updateTagFilterSummary();
    closeTagFilterMenu();
    return;
  }

  elements.tagFilterToggle.disabled = false;
  selectedFilters = new Set(Array.from(selectedFilters).filter((tag) => tagLibrary.includes(tag)));

  elements.tagFilterContainer.innerHTML = tagLibrary
    .map(
      (tag) => `
        <label>
          <span>${tag}</span>
          <input type="checkbox" value="${tag}" ${selectedFilters.has(tag) ? 'checked' : ''} />
        </label>
      `
    )
    .join('');

  elements.cardTagOptions.innerHTML = tagLibrary
    .map(
      (tag) => `
        <label>
          <input type="checkbox" name="cardTag" value="${tag}" />
          <span>${tag}</span>
        </label>
      `
    )
    .join('');

  updateTagFilterSummary();
};

const renderCardList = () => {
  elements.totalCards.textContent = `${cards.length}件`;
  elements.cardList.innerHTML = '';

  if (!cards.length) {
    elements.cardList.innerHTML = '<p class="small">カードを登録するとここに表示されます。</p>';
    return;
  }

  cards.forEach((card) => {
    const clone = elements.cardRowTemplate.content.cloneNode(true);
    clone.querySelector('.row-front').textContent = `表: ${card.frontText}`;
    clone.querySelector('.row-back').textContent = `裏: ${card.backText}`;
    const tags = clone.querySelector('.row-tags');
    tags.innerHTML = card.tags.map((tag) => `<span class="tag-pill">${tag}</span>`).join('');
    const row = clone.querySelector('.card-row');
    row.dataset.id = card.id;
    const editButton = clone.querySelector('[data-action="edit"]');
    const deleteButton = clone.querySelector('[data-action="delete"]');
    editButton.addEventListener('click', () => startEdit(card.id));
    deleteButton.addEventListener('click', () => deleteCard(card.id));
    elements.cardList.appendChild(clone);
  });
};

const startEdit = (cardId) => {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return;
  resetForm();
  elements.cardId.value = card.id;
  elements.frontInput.value = card.frontText;
  elements.backInput.value = card.backText;
  if (elements.frontNoteInput) {
    elements.frontNoteInput.value = card.frontNote || '';
  }
  elements.frontHintInput.value = card.frontHint || '';
  elements.backMemoInput.value = card.backMemo || '';
  Array.from(elements.cardTagOptions.querySelectorAll('input')).forEach((input) => {
    input.checked = card.tags.includes(input.value);
  });
  openManagePanel();
  focusManageForm();
};

const deleteCard = (cardId) => {
  if (!confirm('このカードを削除しますか？')) return;
  cards = cards.filter((card) => card.id !== cardId);
  persistCards();
  updateActiveCards();
};

const deleteCurrentCard = () => {
  const card = currentCard();
  if (!card) return;
  deleteCard(card.id);
};

const getTrimmedField = (formData, fieldName) => {
  const value = formData.get(fieldName);
  return typeof value === 'string' ? value.trim() : '';
};

const upsertCard = (event) => {
  event.preventDefault();
  const formData = new FormData(elements.cardForm);
  const id = formData.get('cardId');
  const payload = {
    id: id || crypto.randomUUID?.() || `card-${Date.now()}`,
    frontText: getTrimmedField(formData, 'frontText'),
    backText: getTrimmedField(formData, 'backText'),
    frontNote: getTrimmedField(formData, 'frontNote'),
    frontHint: getTrimmedField(formData, 'frontHint'),
    backMemo: getTrimmedField(formData, 'backMemo'),
    tags: Array.from(elements.cardTagOptions.querySelectorAll('input:checked')).map((el) => el.value),
    checked: id ? cards.find((card) => card.id === id)?.checked ?? false : false,
    createdAt: id ? cards.find((card) => card.id === id)?.createdAt ?? Date.now() : Date.now(),
  };

  if (!payload.frontText || !payload.backText) {
    alert('表面と裏面のフレーズは必須です');
    return;
  }

  if (id) {
    cards = cards.map((card) => (card.id === id ? payload : card));
  } else {
    cards = [...cards, payload];
  }

  persistCards();
  updateActiveCards();
  closeManagePanel();
};

const toggleCheck = () => {
  const card = currentCard();
  if (!card) return;
  card.checked = !card.checked;
  persistCards();
  if (elements.excludeChecked.checked) {
    updateActiveCards();
  } else {
    renderCard();
    renderCardList();
  }
};

const addTag = () => {
  const value = elements.newTagInput.value.trim();
  if (!value) return;
  if (tagLibrary.includes(value)) {
    alert('既に登録されているタグです');
    return;
  }
  tagLibrary.push(value);
  persistTags();
  elements.newTagInput.value = '';
  renderTagFilters();
};

const buildExportPayload = () => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  cards,
  tags: tagLibrary,
});

const downloadJson = (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `flipper-data-${timestamp}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportDataToFile = () => {
  downloadJson(buildExportPayload());
};

const firstArray = (...candidates) => candidates.find((candidate) => Array.isArray(candidate));
const parseImportedData = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('JSON オブジェクトではありません');
  }

  if (Array.isArray(raw)) {
    return { cards: raw, tags: [] };
  }

  const cards =
    firstArray(
      raw.cards,
      raw.data?.cards,
      raw.payload?.cards,
      raw.koreanFlashcards,
      raw.flashcards
    ) ?? [];

  if (!cards.length) {
    throw new Error('カードの配列が見つかりませんでした');
  }

  const tags =
    firstArray(raw.tags, raw.data?.tags, raw.payload?.tags, raw.tagLibrary, raw.koreanFlashcardTags) ?? [];

  return { cards, tags };
};

const applyImportedData = (data) => {
  const normalizedCards = data.cards.map((card, index) => normalizeCard(card, index));
  const normalizedTags = data.tags.filter((tag) => typeof tag === 'string' && tag.trim() !== '');
  cards = normalizedCards;
  tagLibrary = normalizedTags.length
    ? Array.from(new Set(normalizedTags))
    : Array.from(new Set(cards.flatMap((card) => card.tags)));
  persistCards();
  persistTags();
  resetForm();
  renderTagFilters();
  updateActiveCards();
};

const handleImportFile = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    try {
      const json = JSON.parse(loadEvent.target.result);
      const payload = parseImportedData(json);
      if (
        !confirm(
          `現在のデータ (${cards.length}件) を上書きして ${payload.cards.length}件のカードを読み込みます。よろしいですか？`
        )
      ) {
        return;
      }
      applyImportedData(payload);
      alert('インポートが完了しました');
    } catch (error) {
      console.error('Failed to import data', error);
      alert('インポートに失敗しました。JSON ファイルの形式を確認してください。');
    } finally {
      elements.importInput.value = '';
    }
  };
  reader.readAsText(file);
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service Worker の登録に失敗しました', error);
    });
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
};

const attachListeners = () => {
  elements.modeSelect.addEventListener('change', updateActiveCards);
  elements.excludeChecked.addEventListener('change', updateActiveCards);
  elements.tagFilterContainer.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      const tag = event.target.value;
      if (event.target.checked) {
        selectedFilters.add(tag);
      } else {
        selectedFilters.delete(tag);
      }
      updateTagFilterSummary();
      updateActiveCards();
    }
  });
  elements.tagFilterContainer.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  elements.tagFilterToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleTagFilterMenu();
  });
  elements.openManagePanelButton?.addEventListener('click', () => {
    resetForm();
    openManagePanel();
    focusManageForm();
  });
  elements.closeManagePanelButton?.addEventListener('click', closeManagePanel);
  elements.manageOverlay?.addEventListener('click', (event) => {
    if (event.target === elements.manageOverlay) {
      closeManagePanel();
    }
  });
  document.addEventListener('click', (event) => {
    if (
      tagFilterMenuOpen &&
      !elements.tagFilterContainer.contains(event.target) &&
      !elements.tagFilterToggle.contains(event.target)
    ) {
      closeTagFilterMenu();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (tagFilterMenuOpen) {
      closeTagFilterMenu();
    } else if (managePanelOpen) {
      closeManagePanel();
    }
  });
  elements.frontSpeak.addEventListener('click', (event) => {
    event.stopPropagation();
    speakText(currentCard()?.frontText, 'ko-KR');
  });
  elements.backSpeak.addEventListener('click', (event) => {
    event.stopPropagation();
    speakText(currentCard()?.backText, 'ko-KR');
  });
  elements.deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteCurrentCard();
  });
  elements.editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = currentCard();
    if (!card) return;
    startEdit(card.id);
  });
  elements.checkButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCheck();
  });
  elements.prevCard.addEventListener('click', (event) => {
    event.stopPropagation();
    goTo(-1);
  });
  elements.nextCard.addEventListener('click', (event) => {
    event.stopPropagation();
    goTo(1);
  });
  elements.toggleSide.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSide();
  });
  elements.card.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    toggleSide();
  });
  elements.card.addEventListener('touchstart', handleTouchStart, { passive: true });
  elements.card.addEventListener('touchend', handleTouchEnd, { passive: true });
  elements.frontHint.addEventListener('click', (event) => {
    if (elements.frontHint.classList.contains('hidden')) return;
    event.stopPropagation();
    elements.frontHint.classList.toggle('revealed');
  });
  elements.resetProgress.addEventListener('click', () => {
    if (!confirm('全てのチェックを外しますか？')) return;
    cards = cards.map((card) => ({ ...card, checked: false }));
    persistCards();
    renderCard();
  });
  elements.cardForm.addEventListener('submit', upsertCard);
  elements.cancelEdit.addEventListener('click', resetForm);
  elements.addTagButton.addEventListener('click', addTag);
  elements.exportData?.addEventListener('click', exportDataToFile);
  elements.importData?.addEventListener('click', () => elements.importInput?.click());
  elements.importInput?.addEventListener('change', handleImportFile);
};

let touchStartX = 0;
const handleTouchStart = (event) => {
  touchStartX = event.changedTouches[0].screenX;
};

const handleTouchEnd = (event) => {
  const delta = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(delta) < 40) return;
  if (delta > 0) {
    goTo(-1);
  } else {
    goTo(1);
  }
};

const primeSpeechOnFirstInteraction = () => {
  if (!window.speechSynthesis) return;
  const warmup = () => {
    subscribeVoiceChanges();
    waitForVoices();
  };
  const handler = () => {
    warmup();
    document.removeEventListener('touchstart', handler, true);
    document.removeEventListener('mousedown', handler, true);
    document.removeEventListener('keydown', handler, true);
  };
  document.addEventListener('touchstart', handler, true);
  document.addEventListener('mousedown', handler, true);
  document.addEventListener('keydown', handler, true);
};

const init = () => {
  loadData();
  renderTagFilters();
  attachListeners();
  primeSpeechOnFirstInteraction();
  updateActiveCards();
};

init();
registerServiceWorker();
