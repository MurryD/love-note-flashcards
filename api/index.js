const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { put, del } = require('@vercel/blob');

const app = express();

// records.json 存 /tmp（文字数据很轻量，且客户端 localStorage 镜像兜底）
const DATA_DIR = path.join('/tmp', 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RECORDS_FILE)) fs.writeFileSync(RECORDS_FILE, '[]', 'utf-8');

app.use(cors());
app.use(express.json());

// multer 改为内存存储（buffer 直接传 Vercel Blob）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

function readRecords() {
  try { return JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8')); }
  catch { return []; }
}
function writeRecords(records) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

// 获取所有记录（img 已经是云端 URL，直接返回）
app.get('/api/records', (req, res) => {
  const records = readRecords();
  res.json(records);
});

// 新建记录 —— 图片上传到 Vercel Blob
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
    const records = readRecords();
    records.unshift(record);
    writeRecords(records);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除记录 —— 同时删除 Vercel Blob 中的图片
app.delete('/api/records/:id', async (req, res) => {
  try {
    const records = readRecords();
    const idx = records.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '记录不存在' });
    const record = records[idx];
    // 删除 Vercel Blob 中的图片
    if (record.img && record.img.includes('public.blob.vercel-storage.com')) {
      try { await del(record.img); } catch {}
    }
    records.splice(idx, 1);
    writeRecords(records);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
