function ensureVocabularyFields(data) {
  if (!Array.isArray(data.vocabularyCards)) {
    data.vocabularyCards = [];
    return;
  }

  data.vocabularyCards = data.vocabularyCards.map((card) => {
    const back = Array.isArray(card.back) ? card.back : (card.content ? [card.content] : []);
    const tags = Array.isArray(card.tags) ? card.tags : [];
    const speaker = card.speaker || card.speaker_type || 'none';
    return {
      front: '',
      note: '',
      rememberCount: 0,
      nextReviewAt: null,
      updatedAt: card.updatedAt || card.createdAt || Date.now(),
      ...card,
      back,
      tags,
      speaker,
      speaker_type: speaker,
    };
  });
}

let activeTextMenu = null;

function closeTextContextMenu() {
  if (activeTextMenu?.handler) {
    document.removeEventListener('click', activeTextMenu.handler);
  }
  if (activeTextMenu?.menu?.isConnected) {
    activeTextMenu.menu.remove();
  }
  activeTextMenu = null;
}

function showTextContextMenu(target, onCreateCard) {
  closeTextContextMenu();

  const menu = document.createElement('div');
  menu.className = 'text-context-menu';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'context-menu-button';
  action.textContent = 'カードにする';
  action.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTextContextMenu();
    onCreateCard();
  });

  const helper = document.createElement('div');
  helper.className = 'context-menu-helper';
  helper.textContent = 'SNSに残したまま単語カードへ保存します。';

  menu.append(action, helper);
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

function findVocabularyCard(postId, textIndex) {
  return (state.data.vocabularyCards || []).find((card) => card.postId === postId && card.textIndex === textIndex);
}

function buildVocabularyCard(post, textIndex) {
  if (!post || post.isDeleted) return null;
  const text = post.texts?.[textIndex];
  if (!text) return null;
  const content = (text.content || '').trim();
  if (!content.length) return null;
  const now = Date.now();
  return {
    id: `card-${post.id}-${textIndex}`,
    postId: post.id,
    textIndex,
    content,
    language: text.language || '',
    pronunciation: text.pronunciation || '',
    speaker: text.speaker || text.speaker_type || 'none',
    speaker_type: text.speaker || text.speaker_type || 'none',
    createdAt: post.createdAt,
    tags: Array.isArray(post.tags) ? [...post.tags] : [],
    front: '',
    back: [content],
    note: '',
    rememberCount: 0,
    nextReviewAt: null,
    updatedAt: now,
  };
}

function addVocabularyCardFromPost(post, textIndex) {
  if (!post || post.isDeleted) return;
  const existing = findVocabularyCard(post.id, textIndex);
  if (existing) {
    focusVocabularyCard(existing);
    return;
  }
  const card = buildVocabularyCard(post, textIndex);
  if (!card) return;
  state.data.vocabularyCards.push(card);
  ensureVocabularyFields(state.data);
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

function renderVocabulary() {
  const list = document.getElementById('vocabulary-list');
  if (!list) return;
  const cards = [...(state.data.vocabularyCards || [])];
  const countEl = document.getElementById('vocabulary-count');
  const reviewEl = document.getElementById('vocabulary-review-count');
  const reviewTotal = cards.reduce((sum, card) => sum + (Number(card.rememberCount) || 0), 0);

  if (countEl) countEl.textContent = cards.length;
  if (reviewEl) reviewEl.textContent = reviewTotal;

  list.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = 'まだ単語カードがありません。投稿のテキストを長押しして追加してください。';

  const getUpdatedTimestamp = (item) => (item?.updatedAt || item?.createdAt || 0);
  cards.sort((a, b) => getUpdatedTimestamp(b) - getUpdatedTimestamp(a));

  if (!cards.length) {
    list.appendChild(empty);
    return;
  }

  cards.forEach((card) => {
    const cardEl = document.createElement('article');
    cardEl.className = 'vocabulary-card';
    cardEl.dataset.cardId = card.id;
    cardEl.dataset.postId = card.postId;

    const header = document.createElement('div');
    header.className = 'vocabulary-card-header';

    const title = document.createElement('h3');
    title.className = 'vocabulary-card-title';
    const lang = document.createElement('span');
    lang.className = 'text-label';
    lang.textContent = getLanguageLabel(card.language);
    const speaker = document.createElement('span');
    speaker.className = 'text-label';
    speaker.textContent = getSpeakerLabel(card.speaker);
    title.append(lang, speaker);

    const meta = document.createElement('div');
    meta.className = 'vocabulary-meta';
    meta.textContent = `post #${card.postId} / index ${card.textIndex} / ${formatDate(card.createdAt)}`;

    header.append(title, meta);

    const content = document.createElement('div');
    content.className = 'vocabulary-content';
    content.textContent = card.content;

    const extras = document.createElement('div');
    extras.className = 'vocabulary-meta';
    extras.textContent = `back: ${card.back.join(', ')}`;

    const actions = document.createElement('div');
    actions.className = 'vocabulary-actions';
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'vocabulary-link-button';
    link.textContent = 'SNS投稿を開く';
    link.addEventListener('click', () => jumpToPost(card.postId, card.textIndex));
    actions.appendChild(link);

    const cardNodes = [header, content];

    if (card.pronunciation) {
      const pron = document.createElement('div');
      pron.className = 'pronunciation';
      pron.textContent = card.pronunciation;
      cardNodes.push(pron);
    }

    cardNodes.push(extras, actions);

    if (Array.isArray(card.tags) && card.tags.length) {
      const tags = document.createElement('div');
      tags.className = 'tag-list';
      card.tags.forEach((tag) => {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = `#${tag}`;
        tags.appendChild(t);
      });
      cardNodes.push(tags);
    }

    cardEl.append(...cardNodes);
    list.appendChild(cardEl);
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
      showTextContextMenu(target, () => addVocabularyCardFromPost(post, textIndex));
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
    showTextContextMenu(target, () => addVocabularyCardFromPost(post, textIndex));
  });
}
