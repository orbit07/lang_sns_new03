let activeTextMenu = null;
let vocabularyControlsReady = false;
let vocabularyTabsReady = false;
const vocabularyReviewState = {
  todayList: [],
  todayIndex: 0,
  showFront: true,
  lastLoadedDate: null,
};

function closeTextContextMenu() {
  if (activeTextMenu?.handler) {
    document.removeEventListener('click', activeTextMenu.handler);
  }
  if (activeTextMenu?.menu?.isConnected) {
    activeTextMenu.menu.remove();
  }
  activeTextMenu = null;
}

function showTextContextMenu(target, { onAddFront, onAddBack }) {
  closeTextContextMenu();

  const menu = document.createElement('div');
  menu.className = 'text-context-menu';

  const group = document.createElement('div');
  group.className = 'context-menu-group';

  const toFront = document.createElement('button');
  toFront.type = 'button';
  toFront.className = 'context-menu-button';
  toFront.textContent = '表に追加';
  toFront.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTextContextMenu();
    onAddFront();
  });

  const toBack = document.createElement('button');
  toBack.type = 'button';
  toBack.className = 'context-menu-button';
  toBack.textContent = '裏に追加';
  toBack.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTextContextMenu();
    onAddBack();
  });

  group.append(toFront, toBack);

  const helper = document.createElement('div');
  helper.className = 'context-menu-helper';
  helper.textContent = 'SNSに残したまま単語カードへ保存します。';

  menu.append(group, helper);
  document.body.appendChild(menu);

  const rect = target.getBoundingClientRect();
  const { offsetWidth, offsetHeight } = menu;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - offsetWidth - 8);
  const top = Math.min(window.innerHeight - offsetHeight - 8, rect.bottom + 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const handler = (e) => {
    if (!menu.contains(e.target)) closeTextContextMenu();
  };
  setTimeout(() => document.addEventListener('click', handler), 0);
  activeTextMenu = { menu, handler };
}

function buildBackEntryFromText(post, textIndex) {
  const text = post?.texts?.[textIndex];
  if (!text) return null;
  return {
    content: (text.content || '').trim(),
    language: text.language || '',
    pronunciation: text.pronunciation || null,
    speaker: text.speaker || text.speaker_type || 'none',
    fromPostId: post.id,
    textIndex,
  };
}

function getRelatedPosts(basePost) {
  if (!basePost) return [];
  const rootId = basePost.repostOf || basePost.id;
  const relatedIds = new Set([basePost.id, rootId]);

  (state.data.posts || []).forEach((p) => {
    if (p.id === rootId || p.repostOf === rootId) {
      relatedIds.add(p.id);
      if (p.repostOf) relatedIds.add(p.repostOf);
    }
    if (p.repostOf === basePost.id) {
      relatedIds.add(p.id);
    }
  });

  return (state.data.posts || []).filter((p) => relatedIds.has(p.id));
}

function collectRelatedTextEntries(basePost) {
  if (!basePost) return [];
  return getRelatedPosts(basePost)
    .flatMap((post) =>
      (post.texts || [])
        .map((text, textIndex) => ({ post, text, textIndex }))
        .filter((item) => (item.text.content || '').trim().length),
    )
    .map(({ post, text, textIndex }) => {
      let sourceLabel = '関連リポスト';
      if (post.id === basePost.id) sourceLabel = 'このポスト';
      else if (post.id === basePost.repostOf) sourceLabel = '元ポスト';

      return {
        postId: post.id,
        textIndex,
        content: (text.content || '').trim(),
        language: text.language || '',
        pronunciation: text.pronunciation || '',
        speaker: text.speaker || text.speaker_type || 'none',
        sourceLabel,
      };
    });
}

function createVocabularyCard(front, { post, textIndex }) {
  const now = Date.now();
  return {
    id: nextId(),
    createdAt: now,
    updatedAt: now,
    fromPostId: post?.id ?? null,
    front,
    frontLanguage: post?.texts?.[textIndex]?.language || '',
    frontPronunciation: post?.texts?.[textIndex]?.pronunciation || null,
    frontSpeaker: post?.texts?.[textIndex]?.speaker || post?.texts?.[textIndex]?.speaker_type || 'none',
    back: [],
    rememberCount: 0,
    nextReviewDate: getDateKey(now),
    isArchived: false,
    tags: [],
    memo: '',
    frontSource: post && typeof textIndex === 'number' ? { postId: post.id, textIndex } : null,
  };
}

function createEmptyVocabularyCard() {
  const now = Date.now();
  return {
    id: nextId(),
    createdAt: now,
    updatedAt: now,
    fromPostId: null,
    frontSource: null,
    front: '',
    frontLanguage: '',
    frontPronunciation: null,
    frontSpeaker: 'none',
    back: [],
    rememberCount: 0,
    nextReviewDate: getDateKey(now),
    isArchived: false,
    tags: [],
    memo: '',
  };
}

function addFrontFromPost(post, textIndex) {
  if (!post || post.isDeleted) return;
  const text = post.texts?.[textIndex];
  if (!text?.content?.trim()) return;
  setActiveView('vocabulary');
  setActiveVocabularyTab('vocabulary-today');
  openVocabularyEditor(
    {
      ...createEmptyVocabularyCard(),
      fromPostId: post.id,
      front: text.content.trim(),
      frontLanguage: text.language || '',
      frontPronunciation: text.pronunciation || '',
      frontSpeaker: text.speaker || text.speaker_type || 'none',
      frontSource: { postId: post.id, textIndex },
    },
    { isNew: true, relatedPost: post, presetSide: 'front', presetTextIndex: textIndex },
  );
}

function addBackFromPost(post, textIndex) {
  if (!post || post.isDeleted) return;
  const entry = buildBackEntryFromText(post, textIndex);
  if (!entry || !entry.content.trim()) return;
  setActiveView('vocabulary');
  setActiveVocabularyTab('vocabulary-today');
  const card = {
    ...createEmptyVocabularyCard(),
    fromPostId: post.id,
    back: [entry],
  };

  openVocabularyEditor(card, { isNew: true, relatedPost: post, presetSide: 'back', presetTextIndex: textIndex });
}

function focusVocabularyCard(card) {
  if (!card) return;
  setActiveView('vocabulary');
  renderVocabulary();
  highlightVocabularyCard(card.id);
}

function highlightVocabularyCard(cardId) {
  requestAnimationFrame(() => {
    const target = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!target) return;
    target.classList.add('vocabulary-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => target.classList.remove('vocabulary-highlight'), 1800);
  });
}

function highlightPostText(postId, textIndex) {
  const target = document.querySelector(`[data-post-id="${postId}"][data-text-index="${textIndex}"]`);
  if (!target) return false;
  target.classList.add('text-block-highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target.classList.remove('text-block-highlight'), 1500);
  return true;
}

function jumpToPost(postId, textIndex) {
  setActiveView('sns');
  setActiveTab('timeline');
  render({ focusPostId: postId });
  setTimeout(() => {
    const found = highlightPostText(postId, textIndex);
    if (!found) {
      const post = state.data.posts.find((p) => p.id === postId);
      if (post) openModal(renderPostCard(post), '投稿詳細');
    }
  }, 100);
}

function attachVocabularyAction(target, post, textIndex) {
  if (!target || !post || post.isDeleted) return;
  let timer = null;
  const start = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    timer = setTimeout(() => {
      showTextContextMenu(target, {
        onAddFront: () => addFrontFromPost(post, textIndex),
        onAddBack: () => addBackFromPost(post, textIndex),
      });
    }, 600);
  };
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  ['mousedown', 'touchstart'].forEach((eventName) => target.addEventListener(eventName, start));
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((eventName) => target.addEventListener(eventName, cancel));
  target.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTextContextMenu(target, {
      onAddFront: () => addFrontFromPost(post, textIndex),
      onAddBack: () => addBackFromPost(post, textIndex),
    });
  });
}

function calcNextReviewDate(rememberCount) {
  const today = new Date();
  let days = 30;
  if (rememberCount <= 1) days = 1;
  else if (rememberCount === 2) days = 7;
  else if (rememberCount === 3) days = 30;
  today.setDate(today.getDate() + days);
  return getDateKey(today);
}

function incrementRemember(card) {
  card.rememberCount = Number(card.rememberCount || 0) + 1;
  card.nextReviewDate = calcNextReviewDate(card.rememberCount);
  card.updatedAt = Date.now();
  persistData();
  renderVocabulary();
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDueCards() {
  const todayKey = getDateKey(Date.now());
  return (state.data.vocabularyCards || []).filter(
    (card) => !card.isArchived && (!card.nextReviewDate || card.nextReviewDate <= todayKey),
  );
}

function loadTodayCards(force = false) {
  const todayKey = getDateKey(Date.now());
  if (!force && vocabularyReviewState.lastLoadedDate === todayKey && vocabularyReviewState.todayList.length) return;
  vocabularyReviewState.lastLoadedDate = todayKey;
  vocabularyReviewState.todayList = shuffle(getDueCards());
  vocabularyReviewState.todayIndex = 0;
  vocabularyReviewState.showFront = true;
}

function getCurrentTodayCard() {
  return vocabularyReviewState.todayList[vocabularyReviewState.todayIndex] || null;
}

function goNextTodayCard() {
  vocabularyReviewState.todayIndex += 1;
  vocabularyReviewState.showFront = true;
  renderVocabularyToday();
}

function setupVocabularyControls() {
  if (vocabularyControlsReady) return;
  vocabularyControlsReady = true;
  ['vocabulary-search', 'vocabulary-lang-filter', 'vocabulary-speaker-filter', 'vocabulary-sort', 'vocabulary-show-archived']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => renderVocabulary());
    });

  const searchBtn = document.getElementById('vocabulary-search-btn');
  if (searchBtn) searchBtn.addEventListener('click', () => renderVocabulary());
}

function buildBackList(backItems) {
  const list = document.createElement('ul');
  list.className = 'vocabulary-back-list';
  backItems.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'vocabulary-back-item';

    const lang = document.createElement('span');
    lang.className = 'text-label';
    lang.textContent = getLanguageLabel(entry.language);

    const speaker = document.createElement('span');
    speaker.className = 'text-label';
    speaker.textContent = getSpeakerLabel(entry.speaker);

    const text = document.createElement('span');
    text.textContent = entry.content;

    item.append(lang, speaker, text);

    if (entry.pronunciation) {
      const pron = document.createElement('div');
      pron.className = 'pronunciation';
      pron.textContent = entry.pronunciation;
      item.appendChild(pron);
    }
    list.appendChild(item);
  });
  return list;
}

function buildEmptyState(message) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = message;
  return empty;
}

function renderVocabularySummary() {
  const cards = state.data.vocabularyCards || [];
  const countEl = document.getElementById('vocabulary-count');
  const reviewEl = document.getElementById('vocabulary-review-count');
  const reviewBadge = document.getElementById('vocabulary-review-badge');
  const progressEl = document.getElementById('vocabulary-today-progress');

  const reviewTotal = cards.reduce((sum, card) => sum + (Number(card.rememberCount) || 0), 0);
  const dueCount = getDueCards().length;
  const todayTotal = vocabularyReviewState.todayList.length;
  const shownIndex = todayTotal ? Math.min(vocabularyReviewState.todayIndex + 1, todayTotal) : 0;

  if (countEl) countEl.textContent = cards.length;
  if (reviewEl) reviewEl.textContent = reviewTotal;
  if (reviewBadge) reviewBadge.textContent = dueCount;
  if (progressEl) progressEl.textContent = `${shownIndex} / ${todayTotal}`;
}

function openVocabularyModal(content, title = 'カード編集') {
  const modal = document.getElementById('vocabulary-modal');
  const body = document.getElementById('vocabulary-modal-body');
  const titleEl = document.getElementById('vocabulary-modal-title');
  if (!modal || !body || !titleEl) return;

  titleEl.textContent = title;
  body.innerHTML = '';
  body.appendChild(content);
  showModalElement(modal);
}

function closeVocabularyModal() {
  const modal = document.getElementById('vocabulary-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  hideModalElement(modal);
}

function openVocabularyEditor(card, options = {}) {
  const { isNew = false, relatedPost = null } = options;
  const container = document.createElement('div');
  container.className = 'form-stack vocabulary-modal-stack';

  let frontSource = card.frontSource || null;

  const relatedEntries = relatedPost ? collectRelatedTextEntries(relatedPost) : [];

  const frontInput = document.createElement('textarea');
  frontInput.value = card.front || '';
  frontInput.rows = 2;
  frontInput.placeholder = '表（状況）';
  frontInput.className = 'vocabulary-textarea vocabulary-front-input';
  container.append(frontInput);

  frontInput.addEventListener('input', () => {
    if (!frontInput.value.trim()) {
      frontSource = null;
    }
  });

  const frontMetaRow = document.createElement('div');
  frontMetaRow.className = 'inline-form-row front-meta-row vocabulary-front-meta';

  const frontLang = document.createElement('select');
  frontLang.innerHTML = '<option value="">言語</option>' + langOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  frontLang.value = card.frontLanguage || '';
  frontLang.className = 'vocabulary-front-language';

  const frontPron = document.createElement('input');
  frontPron.type = 'text';
  frontPron.placeholder = '発音メモ（任意）';
  frontPron.value = card.frontPronunciation || '';
  frontPron.className = 'vocabulary-front-pronunciation';

  const frontSpeaker = document.createElement('select');
  frontSpeaker.innerHTML = speakerOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  frontSpeaker.value = card.frontSpeaker || 'none';
  frontSpeaker.className = 'vocabulary-front-speaker';

  frontMetaRow.append(frontLang, frontPron, frontSpeaker);
  container.appendChild(frontMetaRow);

  const backLabel = document.createElement('div');
  backLabel.textContent = '裏（言い方を追加）';
  backLabel.className = 'vocabulary-back-label';
  container.appendChild(backLabel);

  const backWrap = document.createElement('div');
  backWrap.className = 'form-stack vocabulary-back-wrap';

  const ensureBackEntry = () => {
    if (!card.back.length) {
      card.back.push({ content: '', language: '', pronunciation: '', speaker: 'none' });
    }
  };

  const renderRows = () => {
    ensureBackEntry();
    backWrap.innerHTML = '';
    card.back.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'inline-form-row vocabulary-back-row';
      row.dataset.fromPostId = entry.fromPostId ?? '';
      row.dataset.textIndex = typeof entry.textIndex === 'number' ? entry.textIndex : '';

      const content = document.createElement('input');
      content.type = 'text';
      content.value = entry.content || '';
      content.placeholder = '表現';
      content.dataset.field = 'content';
      content.className = 'vocabulary-back-content';

      const lang = document.createElement('select');
      lang.innerHTML = '<option value="">言語</option>' + langOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
      lang.value = entry.language || '';
      lang.dataset.field = 'language';
      lang.className = 'vocabulary-back-language';

      const pron = document.createElement('input');
      pron.type = 'text';
      pron.placeholder = '発音メモ';
      pron.value = entry.pronunciation || '';
      pron.dataset.field = 'pronunciation';
      pron.className = 'vocabulary-back-pronunciation';

      const speaker = document.createElement('select');
      speaker.innerHTML = speakerOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
      speaker.value = entry.speaker || 'none';
      speaker.dataset.field = 'speaker';
      speaker.className = 'vocabulary-back-speaker';

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '削除';
      del.className = 'vocabulary-back-delete';
      del.disabled = card.back.length <= 1;
      del.addEventListener('click', () => {
        if (card.back.length <= 1) return;
        card.back.splice(idx, 1);
        renderRows();
      });

      row.append(content, lang, pron, speaker, del);
      backWrap.appendChild(row);
    });
  };

  renderRows();

  const addBackBtn = document.createElement('button');
  addBackBtn.type = 'button';
  addBackBtn.textContent = '＋ 裏を追加';
  addBackBtn.className = 'vocabulary-back-add';
  addBackBtn.addEventListener('click', () => {
    card.back.push({ content: '', language: '', pronunciation: '', speaker: 'none' });
    renderRows();
  });

  container.append(backWrap, addBackBtn);

  const applyFrontEntry = (entry) => {
    if (!entry) return;
    frontInput.value = entry.content || '';
    frontLang.value = entry.language || '';
    frontPron.value = entry.pronunciation || '';
    frontSpeaker.value = entry.speaker || 'none';
    frontSource = typeof entry.textIndex === 'number' ? { postId: entry.postId, textIndex: entry.textIndex } : null;
    if (!card.fromPostId && entry.postId) {
      card.fromPostId = entry.postId;
    }
  };

  const addBackEntry = (entry) => {
    if (!entry) return;
    card.back.push({
      content: entry.content || '',
      language: entry.language || '',
      pronunciation: entry.pronunciation || '',
      speaker: entry.speaker || 'none',
      fromPostId: entry.postId ?? null,
      textIndex: typeof entry.textIndex === 'number' ? entry.textIndex : null,
    });
    if (!card.fromPostId && entry.postId) {
      card.fromPostId = entry.postId;
    }
    renderRows();
  };

  if (relatedEntries.length) {
    const suggestionSection = document.createElement('div');
    suggestionSection.className = 'vocabulary-suggestion-section';

    const suggestionTitle = document.createElement('h4');
    suggestionTitle.textContent = 'SNSのテキストを利用';
    suggestionTitle.className = 'vocabulary-suggestion-title';
    const suggestionHint = document.createElement('p');
    suggestionHint.className = 'vocabulary-suggestion-hint';
    suggestionHint.textContent = '同じポストやリポストから表・裏を選択するか、手入力してください。';

    const suggestionList = document.createElement('div');
    suggestionList.className = 'vocabulary-suggestion-list';

    relatedEntries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'vocabulary-suggestion-item';

      const meta = document.createElement('div');
      meta.className = 'vocabulary-suggestion-meta';
      const label = document.createElement('span');
      label.className = 'vocabulary-suggestion-source';
      label.textContent = entry.sourceLabel;
      const lang = document.createElement('span');
      lang.className = 'text-label';
      lang.textContent = getLanguageLabel(entry.language);
      meta.append(label, lang);

      const text = document.createElement('div');
      text.className = 'vocabulary-suggestion-text';
      text.textContent = entry.content;

      const actions = document.createElement('div');
      actions.className = 'vocabulary-suggestion-actions';
      const setFront = document.createElement('button');
      setFront.type = 'button';
      setFront.textContent = '表に設定';
      setFront.className = 'vocabulary-suggestion-button vocabulary-suggestion-front';
      setFront.addEventListener('click', () => applyFrontEntry(entry));

      const addBack = document.createElement('button');
      addBack.type = 'button';
      addBack.textContent = '裏に追加';
      addBack.className = 'vocabulary-suggestion-button vocabulary-suggestion-back';
      addBack.addEventListener('click', () => addBackEntry(entry));

      actions.append(setFront, addBack);
      item.append(meta, text, actions);
      suggestionList.appendChild(item);
    });

    suggestionSection.append(suggestionTitle, suggestionHint, suggestionList);
    container.appendChild(suggestionSection);
  }

  const scheduleLabel = document.createElement('label');
  scheduleLabel.textContent = '次の出題日';
  scheduleLabel.className = 'vocabulary-schedule-label';
  const scheduleInput = document.createElement('input');
  scheduleInput.type = 'date';
  scheduleInput.value = card.nextReviewDate || '';
  scheduleInput.className = 'vocabulary-schedule-input';
  container.append(scheduleLabel, scheduleInput);

  const archiveRow = document.createElement('label');
  archiveRow.className = 'vocabulary-checkbox vocabulary-archive-row';
  const archiveInput = document.createElement('input');
  archiveInput.type = 'checkbox';
  archiveInput.checked = Boolean(card.isArchived);
  archiveInput.classList.add('vocabulary-archive-input');
  archiveRow.append(archiveInput, document.createTextNode('アーカイブする'));
  container.appendChild(archiveRow);

  const footer = document.createElement('div');
  footer.className = 'modal-actions vocabulary-modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'キャンセル';
  cancel.className = 'vocabulary-cancel-button';
  cancel.addEventListener('click', () => closeVocabularyModal());

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary vocabulary-save-button';
  save.textContent = '保存';
  save.addEventListener('click', () => {
    const front = frontInput.value.trim();
    const frontLangValue = frontLang.value || '';
    const frontSpeakerValue = frontSpeaker.value || '';
    const rows = Array.from(backWrap.querySelectorAll('.inline-form-row'));
    const back = [];

    if (!front) {
      alert('表のテキストを入力してください。');
      return;
    }
    if (!frontLangValue) {
      alert('表の言語を選択してください。');
      return;
    }
    if (!frontSpeakerValue) {
      alert('表のスピーカーを選択してください。');
      return;
    }

    for (const row of rows) {
      const content = row.querySelector('[data-field="content"]')?.value.trim() || '';
      const language = row.querySelector('[data-field="language"]')?.value || '';
      const pronunciation = row.querySelector('[data-field="pronunciation"]')?.value || '';
      const speaker = row.querySelector('[data-field="speaker"]')?.value || '';
      const fromPostId = row.dataset.fromPostId ? Number(row.dataset.fromPostId) : null;
      const textIndex = row.dataset.textIndex ? Number(row.dataset.textIndex) : null;

      if (!content && !language && !speaker && !pronunciation) continue;
      if (!content) {
        alert('裏のテキストを入力してください。');
        return;
      }
      if (!language) {
        alert('裏の言語を選択してください。');
        return;
      }
      if (!speaker) {
        alert('裏のスピーカーを選択してください。');
        return;
      }

      back.push({ content, language, pronunciation, speaker, fromPostId, textIndex });
    }

    if (!back.length) {
      alert('少なくとも1つ裏の表現を追加してください。');
      return;
    }

    card.front = front;
    card.frontLanguage = frontLangValue;
    card.frontPronunciation = frontPron.value.trim() || '';
    card.frontSpeaker = frontSpeakerValue;
    card.frontSource = frontSource;
    card.back = back;
    card.nextReviewDate = scheduleInput.value || null;
    card.isArchived = archiveInput.checked;
    card.updatedAt = Date.now();
    if (!card.fromPostId) {
      const backSource = back.find((entry) => entry.fromPostId)?.fromPostId;
      card.fromPostId = frontSource?.postId || backSource || null;
    }
    if (isNew && !state.data.vocabularyCards.some((c) => c.id === card.id)) {
      state.data.vocabularyCards.push(card);
    }
    persistData();
    renderVocabulary();
    closeVocabularyModal();
  });

  footer.append(cancel, save);
  container.appendChild(footer);

  openVocabularyModal(container, isNew ? 'カード作成' : 'カード編集');
}

function openNewVocabularyCardModal() {
  const card = createEmptyVocabularyCard();
  openVocabularyEditor(card, { isNew: true });
}

function createSpeechButton(text, language) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'speak-button';
  const label = getLanguageLabel(language) || '発音';
  btn.innerHTML = `<img src="img/vol.svg" alt="" width="16" class="icon-inline"> ${label}`;

  const langInfo = langOptions.find((opt) => opt.value === language);
  const disabled = !langInfo?.speakable || !(text || '').trim().length;
  if (disabled) {
    btn.disabled = true;
    btn.classList.add('disabled');
  } else {
    btn.addEventListener('click', () => playSpeech(text, language));
  }
  return btn;
}

function buildBackEntry(entry) {
  const row = document.createElement('div');
  row.className = 'back-entry';

  const meta = document.createElement('div');
  meta.className = 'back-meta';

  meta.appendChild(createSpeakerBadge(entry.speaker || 'none'));

  meta.appendChild(createSpeechButton(entry.content, entry.language));

  const main = document.createElement('div');
  main.className = 'back-entry-main';

  const text = document.createElement('div');
  text.className = 'back-text';
  text.textContent = entry.content || '';
  main.appendChild(text);

  const actionRow = document.createElement('div');
  actionRow.className = 'back-entry-actions';

  if (entry.pronunciation) {
    const pron = document.createElement('span');
    pron.className = 'pronunciation-chip';
    pron.textContent = entry.pronunciation;
    actionRow.appendChild(pron);
  }

  if (actionRow.children.length) main.appendChild(actionRow);

  row.append(meta, main);
  return row;
}

function deleteVocabularyCard(card) {
  if (!card) return;
  if (!confirm('カードを削除しますか？')) return;
  state.data.vocabularyCards = (state.data.vocabularyCards || []).filter((c) => c.id !== card.id);
  vocabularyReviewState.todayList = vocabularyReviewState.todayList.filter((c) => c.id !== card.id);
  vocabularyReviewState.todayIndex = Math.min(vocabularyReviewState.todayIndex, vocabularyReviewState.todayList.length);
  vocabularyReviewState.showFront = true;
  persistData();
  renderVocabulary();
}

function handleKnow(card) {
  if (!card) return;
  card.rememberCount = Number(card.rememberCount || 0) + 1;
  card.nextReviewDate = calcNextReviewDate(card.rememberCount);
  card.updatedAt = Date.now();
  persistData();
  goNextTodayCard();
}

function handleDontKnow(card) {
  if (!card) return;
  card.rememberCount = 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  card.nextReviewDate = getDateKey(tomorrow);
  card.updatedAt = Date.now();
  persistData();
  goNextTodayCard();
}

function renderTodayReviewCard(card) {
  const cardEl = document.createElement('div');
  cardEl.className = 'vocabulary-review-card';
  cardEl.dataset.cardId = card.id;

  const inner = document.createElement('div');
  inner.className = 'vocabulary-review-card-inner';
  cardEl.appendChild(inner);

  const counterText = `${vocabularyReviewState.todayIndex + 1} / ${vocabularyReviewState.todayList.length}`;
  let frontToggleBtn = null;
  let backToggleBtn = null;

  const updateToggleText = () => {
    const text = vocabularyReviewState.showFront ? '裏を見る' : '表に戻る';
    if (frontToggleBtn) frontToggleBtn.textContent = text;
    if (backToggleBtn) backToggleBtn.textContent = text;
  };

  const toggleCardFace = () => {
    vocabularyReviewState.showFront = !vocabularyReviewState.showFront;
    cardEl.classList.toggle('is-flipped', !vocabularyReviewState.showFront);
    updateToggleText();
  };

  const createHeader = (labelText, isFront = true) => {
    const header = document.createElement('div');
    header.className = 'face-header';

    const faceLabel = document.createElement('span');
    faceLabel.className = 'face-label';
    faceLabel.textContent = labelText;

    const counter = document.createElement('span');
    counter.className = 'review-counter';
    counter.textContent = counterText;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ghost-action vocabulary-toggle-button';
    toggleBtn.addEventListener('click', toggleCardFace);

    if (isFront) frontToggleBtn = toggleBtn;
    else backToggleBtn = toggleBtn;

    header.append(faceLabel, counter, toggleBtn);
    return header;
  };

  const frontFace = document.createElement('div');
  frontFace.className = 'cardface cardface__front vocabulary-review-face';
  frontFace.appendChild(createHeader('Front', true));

  const faceMeta = document.createElement('div');
  faceMeta.className = 'face-meta';

  faceMeta.append(createSpeakerBadge(card.frontSpeaker || 'none'));
  faceMeta.append(createSpeechButton(card.front, card.frontLanguage));

  if (card.frontPronunciation) {
    const pron = document.createElement('span');
    pron.className = 'pronunciation-chip';
    pron.textContent = card.frontPronunciation;
    faceMeta.append(pron);
  }

  const frontText = document.createElement('div');
  frontText.className = 'front-text';
  frontText.textContent = card.front || '（表未設定）';
  frontFace.append(faceMeta, frontText);

  const backFace = document.createElement('div');
  backFace.className = 'cardface cardface__back vocabulary-review-face';
  backFace.appendChild(createHeader('Back', false));

  const backWrap = document.createElement('div');
  backWrap.className = 'back-entries';
  if (!card.back.length) {
    backWrap.appendChild(buildEmptyState('裏が未登録です。編集から追加してください。'));
  } else {
    card.back.forEach((entry) => backWrap.appendChild(buildBackEntry(entry)));
  }
  backFace.appendChild(backWrap);

  if (card.tags?.length) {
    const tagGroup = document.createElement('div');
    tagGroup.className = 'tag-group';
    card.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = `#${tag}`;
      tagGroup.appendChild(chip);
    });
    backFace.appendChild(tagGroup);
  }

  if (card.memo) {
    const memo = document.createElement('div');
    memo.className = 'memo-block';
    memo.textContent = card.memo;
    backFace.appendChild(memo);
  }

  const actions = document.createElement('div');
  actions.className = 'face-actions';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-action';
  remove.innerHTML = '<img src="img/delete.svg" alt="削除" width="20" class="icon-inline">';
  remove.addEventListener('click', () => deleteVocabularyCard(card));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'ghost-action';
  edit.innerHTML = '<img src="img/edit.svg" alt="編集" width="20" class="icon-inline">';
  edit.addEventListener('click', () => openVocabularyEditor(card));

  actions.append(remove, edit);

  if (card.fromPostId) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'ghost-action';
    link.innerHTML = '<img src="img/all_off.svg" alt="投稿を開く" width="20" class="icon-inline">';
    link.addEventListener('click', () => jumpToPost(card.fromPostId, card.frontSource?.textIndex || 0));
    actions.appendChild(link);
  }

  backFace.appendChild(actions);

  const knowActions = document.createElement('div');
  knowActions.className = 'know-actions';

  const dontKnow = document.createElement('button');
  dontKnow.type = 'button';
  dontKnow.className = 'dontknow-button';
  dontKnow.textContent = '分からなかった 👎';
  dontKnow.addEventListener('click', () => handleDontKnow(card));

  const know = document.createElement('button');
  know.type = 'button';
  know.className = 'know-button';
  know.textContent = '分かった 👍';
  know.addEventListener('click', () => handleKnow(card));

  knowActions.append(dontKnow, know);
  backFace.appendChild(knowActions);

  inner.append(frontFace, backFace);
  cardEl.classList.toggle('is-flipped', !vocabularyReviewState.showFront);
  updateToggleText();

  return cardEl;
}

function renderVocabularyCard(card) {
  const cardEl = document.createElement('article');
  cardEl.className = 'vocabulary-card';
  cardEl.dataset.cardId = card.id;
  cardEl.dataset.postId = card.fromPostId;

  const header = document.createElement('div');
  header.className = 'vocabulary-card-header';

  const title = document.createElement('h3');
  title.className = 'vocabulary-card-title';
  title.textContent = card.front || '（表未設定）';

  const meta = document.createElement('div');
  meta.className = 'vocabulary-meta';
  const updated = formatDate(card.updatedAt || card.createdAt);
  meta.textContent = `作成: ${formatDate(card.createdAt)} / 更新: ${updated}`;

  header.append(title, meta);

  const backLabel = document.createElement('div');
  backLabel.className = 'vocabulary-note';
  backLabel.textContent = '裏：複数の言い方';

  const backList = buildBackList(card.back);

  const schedule = document.createElement('div');
  schedule.className = 'vocabulary-schedule';
  schedule.innerHTML = `次の出題日: <strong>${card.nextReviewDate || '未設定'}</strong> / 覚えた！ ${card.rememberCount}`;

  const actions = document.createElement('div');
  actions.className = 'vocabulary-actions';

  const remember = document.createElement('button');
  remember.type = 'button';
  remember.className = 'primary';
  remember.textContent = '覚えた！';
  remember.addEventListener('click', () => incrementRemember(card));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = '編集';
  edit.addEventListener('click', () => openVocabularyEditor(card));

  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = card.isArchived ? 'アーカイブ解除' : 'アーカイブ';
  archive.addEventListener('click', () => {
    card.isArchived = !card.isArchived;
    card.updatedAt = Date.now();
    persistData();
    renderVocabulary();
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '削除';
  remove.addEventListener('click', () => deleteVocabularyCard(card));

  actions.append(remember, edit, archive, remove);

  if (card.fromPostId) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'vocabulary-link-button';
    link.textContent = 'SNS投稿を開く';
    link.addEventListener('click', () => jumpToPost(card.fromPostId, card.frontSource?.textIndex || 0));
    actions.appendChild(link);
  }

  cardEl.append(header, backLabel, backList, schedule, actions);
  return cardEl;
}

function filterAndSortCards(cards) {
  const search = document.getElementById('vocabulary-search')?.value.trim().toLowerCase() || '';
  const langFilter = document.getElementById('vocabulary-lang-filter')?.value || '';
  const speakerFilter = document.getElementById('vocabulary-speaker-filter')?.value || '';
  const sort = document.getElementById('vocabulary-sort')?.value || 'updated';
  const showArchived = document.getElementById('vocabulary-show-archived')?.checked || false;

  const filtered = cards.filter((card) => {
    if (!showArchived && card.isArchived) return false;
    const haystack = [card.front, ...card.back.map((b) => b.content)].join(' ').toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (langFilter && !card.back.some((b) => b.language === langFilter)) return false;
    if (speakerFilter && !card.back.some((b) => b.speaker === speakerFilter)) return false;
    return true;
  });

  const sorters = {
    updated: (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
    created: (a, b) => b.createdAt - a.createdAt,
    next: (a, b) => {
      if (!a.nextReviewDate) return 1;
      if (!b.nextReviewDate) return -1;
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    },
  };

  return filtered.sort(sorters[sort] || sorters.updated);
}

function renderVocabularyToday() {
  const container = document.getElementById('vocabulary-today-card-container');
  const finish = document.getElementById('vocabulary-today-finish');
  if (!container) return;

  const todayKey = getDateKey(Date.now());
  const dueCount = getDueCards().length;
  const finishedToday = vocabularyReviewState.todayIndex >= vocabularyReviewState.todayList.length;
  if (vocabularyReviewState.lastLoadedDate !== todayKey || (!vocabularyReviewState.todayList.length && dueCount) || (finishedToday && dueCount)) {
    loadTodayCards(true);
  }

  renderVocabularySummary();

  container.innerHTML = '';
  const total = vocabularyReviewState.todayList.length;
  const current = getCurrentTodayCard();
  const completed = total === 0 || vocabularyReviewState.todayIndex >= total;

  if (finish) finish.classList.toggle('hidden', !completed);

  if (!total) {
    container.appendChild(buildEmptyState('お疲れさま！今日は復習なし。'));
    return;
  }

  if (!current) {
    return;
  }

  if (finish) finish.classList.add('hidden');
  container.appendChild(renderTodayReviewCard(current));
}

function renderVocabularyList() {
  const list = document.getElementById('vocabulary-list');
  if (!list) return;

  const filtered = filterAndSortCards(state.data.vocabularyCards || []);
  list.innerHTML = '';
  if (!filtered.length) {
    list.appendChild(buildEmptyState('まだ単語カードがありません。投稿のテキストを長押しして追加してください。'));
    return;
  }
  filtered.forEach((card) => list.appendChild(renderVocabularyCard(card)));
}

function renderVocabulary() {
  setupVocabularyControls();
  ensureVocabularyFields(state.data);
  renderVocabularyToday();
  renderVocabularyList();
}

function setActiveVocabularyTab(tabName) {
  if (tabName === 'vocabulary-create') {
    openNewVocabularyCardModal();
    tabName = state.currentVocabularyTab || 'vocabulary-today';
  }
  state.currentVocabularyTab = tabName;
  document.querySelectorAll('.vocabulary-tabs .tab-button[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.vocabulary-tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabName);
  });
  renderVocabulary();
}

function setupVocabularyTabs() {
  if (vocabularyTabsReady) return;
  vocabularyTabsReady = true;
  document.querySelectorAll('.vocabulary-tabs .tab-button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveVocabularyTab(btn.dataset.tab));
  });
  const createBtn = document.getElementById('vocabulary-open-create');
  if (createBtn) {
    createBtn.addEventListener('click', openNewVocabularyCardModal);
  }
}

function setupVocabularyModal() {
  const modal = document.getElementById('vocabulary-modal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = 'true';

  const closeBtn = document.getElementById('vocabulary-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeVocabularyModal);

  modal.addEventListener('click', (e) => {
    if (e.target.id === 'vocabulary-modal') closeVocabularyModal();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupVocabularyModal();
  setupVocabularyTabs();
  setActiveVocabularyTab(state.currentVocabularyTab || 'vocabulary-today');
});
