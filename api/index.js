const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Vercel serverless 使用 /tmp 做临时存储
const DATA_DIR = path.join('/tmp', 'data');
const UPLOADS_DIR = path.join('/tmp', 'uploads');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(RECORDS_FILE)) fs.writeFileSync(RECORDS_FILE, '[]', 'utf-8');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
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

app.get('/api/records', (req, res) => {
  const records = readRecords();
  const host = `${req.protocol}://${req.get('host')}`;
  res.json(records.map(r => ({
    ...r,
    img: r.img ? `${host}/uploads/${r.img}` : null
  })));
});

app.post('/api/records', upload.single('image'), (req, res) => {
  try {
    const { mood, content } = req.body;
    if (!content && !req.file) {
      return res.status(400).json({ error: '内容或图片不能为空' });
    }
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const record = {
      id: uuidv4(),
      time: timeStr,
      mood: mood || '',
      content: content || '',
      img: req.file ? req.file.filename : null
    };
    const records = readRecords();
    records.unshift(record);
    writeRecords(records);
    const host = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      ...record,
      img: record.img ? `${host}/uploads/${record.img}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/records/:id', (req, res) => {
  const records = readRecords();
  const idx = records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '记录不存在' });
  const record = records[idx];
  if (record.img) {
    const imgPath = path.join(UPLOADS_DIR, record.img);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  records.splice(idx, 1);
  writeRecords(records);
  res.json({ success: true });
});

module.exports = app;
