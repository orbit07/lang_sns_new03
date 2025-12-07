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

function createVocabularyCard(front, { post, textIndex }) {
  const now = Date.now();
  return {
    id: nextId(),
    createdAt: now,
    updatedAt: now,
    fromPostId: post?.id ?? null,
    front,
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
    back: [],
    rememberCount: 0,
    nextReviewDate: getDateKey(now),
    isArchived: false,
    tags: [],
    memo: '',
  };
}

function findFrontCard(postId, textIndex) {
  return (state.data.vocabularyCards || []).find(
    (card) => card.frontSource?.postId === postId && card.frontSource?.textIndex === textIndex,
  );
}

function addFrontFromPost(post, textIndex) {
  if (!post || post.isDeleted) return;
  const text = post.texts?.[textIndex];
  if (!text?.content?.trim()) return;
  const existing = findFrontCard(post.id, textIndex);
  if (existing) {
    focusVocabularyCard(existing);
    return;
  }

  const card = createVocabularyCard(text.content.trim(), { post, textIndex });
  state.data.vocabularyCards.push(card);
  persistData();
  renderVocabulary();
  focusVocabularyCard(card);
}

function promptFrontSelection(post, skipIndex) {
  const candidates = (post?.texts || [])
    .map((t, idx) => ({ ...t, idx }))
    .filter((t) => t.idx !== skipIndex && (t.content || '').trim().length);
  if (!candidates.length) {
    return { front: (prompt('表にしたいテキストを入力してください') || '').trim(), textIndex: null };
  }

  const guide = candidates
    .map((t, idx) => `${idx + 1}: ${t.content.trim().slice(0, 40)}`)
    .join('\n');
  const raw = prompt(`どのテキストを表にしますか？\n${guide}\n番号を入力（空欄なら手入力）`);
  if (!raw) return { front: (prompt('表にしたいテキストを入力してください') || '').trim(), textIndex: null };
  const selected = Number(raw) - 1;
  if (Number.isInteger(selected) && candidates[selected]) {
    return { front: candidates[selected].content.trim(), textIndex: candidates[selected].idx };
  }
  return { front: (prompt('表にしたいテキストを入力してください') || '').trim(), textIndex: null };
}

function pickCardForBack(post) {
  const candidates = (state.data.vocabularyCards || []).filter((card) => card.fromPostId === post.id && !card.isArchived);
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;

  const list = candidates.map((c) => `${c.id}: ${c.front || '（表なし）'}`).join('\n');
  const answer = prompt(`どのカードに裏を追加しますか？\n${list}`);
  if (!answer) return null;
  return candidates.find((c) => String(c.id) === answer.trim()) || null;
}

function addBackFromPost(post, textIndex) {
  if (!post || post.isDeleted) return;
  const entry = buildBackEntryFromText(post, textIndex);
  if (!entry || !entry.content.trim()) return;

  let card = pickCardForBack(post);

  if (!card) {
    const { front, textIndex: chosenIndex } = promptFrontSelection(post, textIndex);
    if (!front) return;
    card = createVocabularyCard(front, { post, textIndex: chosenIndex });
    state.data.vocabularyCards.push(card);
  }

  card.back.push(entry);
  card.updatedAt = Date.now();
  if (!card.nextReviewDate) card.nextReviewDate = getDateKey(Date.now());
  persistData();
  renderVocabulary();
  focusVocabularyCard(card);
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

function openVocabularyEditor(card, options = {}) {
  const { isNew = false } = options;
  const container = document.createElement('div');
  container.className = 'form-stack';

  const frontLabel = document.createElement('label');
  frontLabel.textContent = '表（状況）';
  const frontInput = document.createElement('textarea');
  frontInput.value = card.front || '';
  frontInput.rows = 2;
  container.append(frontLabel, frontInput);

  const backLabel = document.createElement('div');
  backLabel.textContent = '裏（言い方を追加）';
  container.appendChild(backLabel);

  const backWrap = document.createElement('div');
  backWrap.className = 'form-stack';

  const renderRows = () => {
    backWrap.innerHTML = '';
    card.back.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'inline-form-row';

      const content = document.createElement('input');
      content.type = 'text';
      content.value = entry.content || '';
      content.placeholder = '表現';
      content.dataset.field = 'content';

      const lang = document.createElement('select');
      lang.innerHTML = '<option value="">言語</option>' + langOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
      lang.value = entry.language || '';
      lang.dataset.field = 'language';

      const pron = document.createElement('input');
      pron.type = 'text';
      pron.placeholder = '発音メモ';
      pron.value = entry.pronunciation || '';
      pron.dataset.field = 'pronunciation';

      const speaker = document.createElement('select');
      speaker.innerHTML = speakerOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
      speaker.value = entry.speaker || 'none';
      speaker.dataset.field = 'speaker';

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '削除';
      del.addEventListener('click', () => {
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
  addBackBtn.addEventListener('click', () => {
    card.back.push({ content: '', language: '', pronunciation: '', speaker: 'none' });
    renderRows();
  });

  container.append(backWrap, addBackBtn);

  const scheduleLabel = document.createElement('label');
  scheduleLabel.textContent = '次の出題日';
  const scheduleInput = document.createElement('input');
  scheduleInput.type = 'date';
  scheduleInput.value = card.nextReviewDate || '';
  container.append(scheduleLabel, scheduleInput);

  const archiveRow = document.createElement('label');
  archiveRow.className = 'vocabulary-checkbox';
  const archiveInput = document.createElement('input');
  archiveInput.type = 'checkbox';
  archiveInput.checked = Boolean(card.isArchived);
  archiveRow.append(archiveInput, document.createTextNode('アーカイブする'));
  container.appendChild(archiveRow);

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'キャンセル';
  cancel.addEventListener('click', () => closeModal());

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = '保存';
  save.addEventListener('click', () => {
    const front = frontInput.value.trim();
    const rows = Array.from(backWrap.querySelectorAll('.inline-form-row'));
    const back = rows
      .map((row) => ({
        content: row.querySelector('[data-field="content"]')?.value.trim() || '',
        language: row.querySelector('[data-field="language"]')?.value || '',
        pronunciation: row.querySelector('[data-field="pronunciation"]')?.value || '',
        speaker: row.querySelector('[data-field="speaker"]')?.value || 'none',
      }))
      .filter((entry) => entry.content.trim().length);
    if (!front && !back.length) {
      alert('表か裏を入力してください。');
      return;
    }
    card.front = front;
    card.back = back;
    card.nextReviewDate = scheduleInput.value || null;
    card.isArchived = archiveInput.checked;
    card.updatedAt = Date.now();
    if (isNew && !state.data.vocabularyCards.some((c) => c.id === card.id)) {
      state.data.vocabularyCards.push(card);
    }
    persistData();
    renderVocabulary();
    closeModal();
  });

  footer.append(cancel, save);
  container.appendChild(footer);

  openModal(container, 'カード編集');
}

function openNewVocabularyCardModal() {
  const card = createEmptyVocabularyCard();
  openVocabularyEditor(card, { isNew: true });
}

function buildBackEntry(entry) {
  const row = document.createElement('div');
  row.className = 'back-entry';

  const meta = document.createElement('div');
  meta.className = 'back-meta';
  const lang = document.createElement('span');
  lang.className = 'text-label';
  lang.textContent = getLanguageLabel(entry.language);
  meta.appendChild(lang);

  meta.appendChild(createSpeakerBadge(entry.speaker || 'none'));

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

  const langInfo = langOptions.find((opt) => opt.value === entry.language);
  if (langInfo?.speakable && (entry.content || '').trim().length) {
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'speak-button';
    speakBtn.innerHTML = '<img src="img/vol.svg" alt="" /> 発音';
    speakBtn.addEventListener('click', () => playSpeech(entry.content, entry.language));
    actionRow.appendChild(speakBtn);
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

  const header = document.createElement('div');
  header.className = 'face-header';
  const faceLabel = document.createElement('span');
  faceLabel.className = 'face-label';
  faceLabel.textContent = vocabularyReviewState.showFront ? 'Front' : 'Back';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'ghost-action';
  toggleBtn.textContent = vocabularyReviewState.showFront ? '裏を見る' : '表に戻る';
  toggleBtn.addEventListener('click', () => {
    vocabularyReviewState.showFront = !vocabularyReviewState.showFront;
    renderVocabularyToday();
  });

  header.append(faceLabel, toggleBtn);
  cardEl.appendChild(header);

  const frontText = document.createElement('div');
  frontText.className = 'front-text';
  frontText.textContent = card.front || '（表未設定）';
  cardEl.appendChild(frontText);

  if (!vocabularyReviewState.showFront) {
    const backWrap = document.createElement('div');
    backWrap.className = 'back-entries';
    if (!card.back.length) {
      backWrap.appendChild(buildEmptyState('裏が未登録です。編集から追加してください。'));
    } else {
      card.back.forEach((entry) => backWrap.appendChild(buildBackEntry(entry)));
    }
    cardEl.appendChild(backWrap);

    if (card.tags?.length) {
      const tagGroup = document.createElement('div');
      tagGroup.className = 'tag-group';
      card.tags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${tag}`;
        tagGroup.appendChild(chip);
      });
      cardEl.appendChild(tagGroup);
    }

    if (card.memo) {
      const memo = document.createElement('div');
      memo.className = 'memo-block';
      memo.textContent = card.memo;
      cardEl.appendChild(memo);
    }

    const actions = document.createElement('div');
    actions.className = 'face-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ghost-action';
    edit.textContent = '編集';
    edit.addEventListener('click', () => openVocabularyEditor(card));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-action';
    remove.textContent = '削除';
    remove.addEventListener('click', () => deleteVocabularyCard(card));

    actions.append(edit, remove);

    if (card.fromPostId) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ghost-action';
      link.textContent = 'SNS投稿を開く';
      link.addEventListener('click', () => jumpToPost(card.fromPostId, card.frontSource?.textIndex || 0));
      actions.appendChild(link);
    }

    cardEl.appendChild(actions);

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
    cardEl.appendChild(knowActions);
  }

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

  if (!total) {
    if (finish) finish.classList.remove('hidden');
    container.appendChild(buildEmptyState('お疲れさま！今日は復習なし。'));
    return;
  }

  if (!current) {
    if (finish) finish.classList.remove('hidden');
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

document.addEventListener('DOMContentLoaded', () => {
  setupVocabularyTabs();
  setActiveVocabularyTab(state.currentVocabularyTab || 'vocabulary-today');
});
