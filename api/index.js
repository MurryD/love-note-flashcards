const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { put, del, list } = require('@vercel/blob');

const app = express();

// /tmp 作为缓存，真数据在 Vercel Blob
const DATA_DIR = path.join('/tmp', 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const BLOB_RECORDS_PATH = 'data/records.json';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

function readRecordsLocal() {
  try { return JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8')); }
  catch { return []; }
}
function writeRecordsLocal(records) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

// 从 Vercel Blob 同步记录到本地缓存
async function syncRecordsFromBlob() {
  try {
    const { blobs } = await list({ prefix: 'data/' });
    const rec = blobs.find(b => b.pathname === BLOB_RECORDS_PATH);
    if (rec) {
      const resp = await fetch(rec.url);
      const records = await resp.json();
      writeRecordsLocal(records);
      return records;
    }
  } catch {}
  return readRecordsLocal();
}

// 保存记录到 Vercel Blob + 本地缓存
async function saveRecordsToBlob(records) {
  writeRecordsLocal(records);
  try {
    await put(BLOB_RECORDS_PATH, JSON.stringify(records, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false
    });
  } catch {}
}

// 获取所有记录
app.get('/api/records', async (req, res) => {
  try {
    const records = await syncRecordsFromBlob();
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

    const record = {
      id: uuidv4(),
      time: timeStr,
      mood: mood || '',
      content: content || '',
      img: imgUrl
    };
    const records = await syncRecordsFromBlob();
    records.unshift(record);
    await saveRecordsToBlob(records);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除记录
app.delete('/api/records/:id', async (req, res) => {
  try {
    const records = await syncRecordsFromBlob();
    const idx = records.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '记录不存在' });
    const record = records[idx];
    if (record.img && record.img.includes('public.blob.vercel-storage.com')) {
      try { await del(record.img); } catch {}
    }
    records.splice(idx, 1);
    await saveRecordsToBlob(records);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
