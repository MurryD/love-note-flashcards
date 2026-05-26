const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { put, del, list } = require('@vercel/blob');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

// 从 Blob 拉取所有卡片（每张卡一个文件，天然无写入冲突）
async function getAllCards() {
  try {
    const { blobs } = await list({ prefix: 'cards/' });
    const cards = [];
    for (const b of blobs) {
      try {
        const resp = await fetch(b.url);
        const card = await resp.json();
        card._blobUrl = b.url;
        cards.push(card);
      } catch {} // 单个卡片损坏不阻塞
    }
    cards.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    // 去掉内部字段
    return cards.map(({ _blobUrl, ...card }) => card);
  } catch { return []; }
}

// 获取所有记录
app.get('/api/records', async (req, res) => {
  try {
    const records = await getAllCards();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新建记录
app.post('/api/records', upload.single('image'), async (req, res) => {
  try {
    const { mood, content } = req.body;
    if (!content && !req.file) {
      return res.status(400).json({ error: '内容或图片不能为空' });
    }
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let imgUrl = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const blob = await put(`images/${uuidv4()}${ext}`, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype
      });
      imgUrl = blob.url;
    }

    const card = {
      id: uuidv4(),
      time: timeStr,
      mood: mood || '',
      content: content || '',
      img: imgUrl
    };
    // 每张卡存成独立文件 → 并发安全
    await put(`cards/${timeStr.replace(/[:\s]/g, '-')}-${card.id.slice(0, 8)}.json`,
      JSON.stringify(card, null, 2),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false }
    );
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除记录
app.delete('/api/records/:id', async (req, res) => {
  try {
    const { blobs } = await list({ prefix: 'cards/' });
    const blob = blobs.find(b => b.pathname.includes(req.params.id));
    if (!blob) return res.status(404).json({ error: '记录不存在' });

    // 读取卡片，删除关联图片
    try {
      const resp = await fetch(blob.url);
      const card = await resp.json();
      if (card.img && card.img.includes('public.blob.vercel-storage.com')) {
        try { await del(card.img); } catch {}
      }
    } catch {}
    await del(blob.url);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
