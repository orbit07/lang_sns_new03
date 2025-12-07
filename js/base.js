const STORAGE_KEY = 'lang-sns-data';
const DATA_VERSION = 1;
const STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB approximate
const IMAGE_RESIZE_THRESHOLD = 1024 * 1024; // 1MB

const defaultData = () => ({
  version: DATA_VERSION,
  posts: [],
  replies: [],
  images: {},
  lastId: 0,
  vocabularyCards: [],
});

const state = {
  data: defaultData(),
  currentTab: 'timeline',
  currentView: 'sns',
  currentVocabularyTab: 'vocabulary-today',
  imageCache: new Map(),
  dashboardChart: null,
  hasPlayedDashboardAnimation: false,
};

const langOptions = [
  { value: 'ja', label: '日本語', speakable: false },
  { value: 'en-US', label: '英語', voiceHint: 'Samantha', speakable: true },
  { value: 'ko-KR', label: '韓国語', voiceHint: 'Yuna', speakable: true },
  { value: 'zh-TW', label: '台湾華語', voiceHint: 'Meijia', speakable: true },
];

const speakerOptions = [
  { value: 'me', label: 'わたし', icon: 'img/icon_me.png' },
  { value: 'friend', label: '友だち', icon: 'img/icon_friend.png' },
  { value: 'staff', label: '店員', icon: 'img/icon_staff.png' },
  { value: 'other', label: 'その他', icon: 'img/icon_other.png' },
  { value: 'none', label: '未指定', icon: 'img/icon_none.png' },
];

const getLanguageLabel = (value) => langOptions.find((opt) => opt.value === value)?.label || value;
const getSpeakerLabel = (value) => speakerOptions.find((opt) => opt.value === value)?.label || value || '未指定';

function ensureVocabularyFields(data) {
  if (!Array.isArray(data.vocabularyCards)) {
    data.vocabularyCards = [];
    return;
  }

  data.vocabularyCards = data.vocabularyCards.map((card) => {
    const inferSpeaker = card.speaker || card.speaker_type || 'none';
    const normalizeBack = (entry) => {
      if (typeof entry === 'string') {
        return {
          content: entry,
          language: card.language || '',
          pronunciation: card.pronunciation || null,
          speaker: inferSpeaker,
        };
      }
      return {
        content: entry?.content || '',
        language: entry?.language || '',
        pronunciation: entry?.pronunciation || entry?.note || null,
        speaker: entry?.speaker || inferSpeaker,
        fromPostId: entry?.fromPostId || card.postId || null,
        textIndex: entry?.textIndex ?? null,
      };
    };

    const backArray = Array.isArray(card.back)
      ? card.back.map(normalizeBack).filter((b) => b.content?.trim().length)
      : card.content
        ? [normalizeBack(card.content)]
        : [];

    const nextReviewDate = card.nextReviewDate || card.nextReviewAt || null;
    const id = typeof card.id === 'number' ? card.id : nextId();
    const createdAt = card.createdAt || Date.now();
    return {
      id,
      fromPostId: card.fromPostId ?? card.postId ?? null,
      frontSource: card.frontSource || (card.postId ? { postId: card.postId, textIndex: card.textIndex ?? null } : null),
      front: card.front || '',
      back: backArray,
      rememberCount: Number(card.rememberCount || 0),
      nextReviewDate: nextReviewDate || null,
      isArchived: Boolean(card.isArchived),
      createdAt,
      updatedAt: card.updatedAt || createdAt,
      tags: Array.isArray(card.tags) ? card.tags : [],
      memo: card.memo || '',
    };
  });
}

function ensureSpeakerFields(data) {
  const sync = (items = []) => {
    items.forEach((item) => {
      (item.texts || []).forEach((text) => {
        const speaker = text.speaker || text.speaker_type || 'none';
        text.speaker = speaker;
        text.speaker_type = speaker;
      });
    });
  };

  sync(data?.posts);
  sync(data?.replies);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.version !== DATA_VERSION) {
      state.data = { ...defaultData(), ...parsed, version: DATA_VERSION };
    } else {
      state.data = parsed;
    }
  } catch (e) {
    console.error('Failed to load data', e);
    state.data = defaultData();
  }

  ensureSpeakerFields(state.data);
  ensureVocabularyFields(state.data);
}

function persistData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  enforceStorageLimit();
}

function nextId() {
  state.data.lastId += 1;
  return state.data.lastId;
}

function extractTags(texts) {
  const tagSet = new Set();
  const regex = /#([\p{L}\p{N}_-]+)/gu;
  texts.forEach((t) => {
    let m;
    while ((m = regex.exec(t.content))) {
      tagSet.add(m[1]);
    }
  });
  return Array.from(tagSet);
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function resizeIfNeeded(dataUrl) {
  if (dataUrl.length <= IMAGE_RESIZE_THRESHOLD) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

function ensureImageId(dataUrl) {
  // deduplicate identical images
  for (const [id, stored] of Object.entries(state.data.images)) {
    if (stored === dataUrl) return id;
  }
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  state.data.images[id] = dataUrl;
  return id;
}

function removeImageIfUnused(imageId) {
  if (!imageId) return;
  const used = state.data.posts.some((p) => p.imageId === imageId) ||
    state.data.replies.some((r) => r.imageId === imageId);
  if (!used) {
    delete state.data.images[imageId];
  }
}

function enforceStorageLimit() {
  let serialized = JSON.stringify(state.data);
  while (serialized.length > STORAGE_LIMIT) {
    // remove images from oldest posts first
    const candidates = [...state.data.posts]
      .filter((p) => p.imageId)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!candidates.length) break;
    const target = candidates[0];
    removeImageIfUnused(target.imageId);
    target.imageId = null;
    target.imageRemoved = true;
    serialized = JSON.stringify(state.data);
  }
  localStorage.setItem(STORAGE_KEY, serialized);
}

function playSpeech(text, lang) {
  if (!text || lang === 'ja') return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  const voices = window.speechSynthesis.getVoices();
  const hint = langOptions.find((l) => l.value === lang)?.voiceHint;
  if (hint) {
    const voice = voices.find((v) => v.name.includes(hint));
    if (voice) utter.voice = voice;
  }
  window.speechSynthesis.speak(utter);
}
