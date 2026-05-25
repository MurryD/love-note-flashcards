const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 目录 ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(RECORDS_FILE)) fs.writeFileSync(RECORDS_FILE, '[]', 'utf-8');

// ── 中间件 ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// 前端静态文件（Railway 部署时一体提供）
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ── multer 配置 ───────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

// ── 工具 ──────────────────────────────────────────────
function readRecords() {
  try { return JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8')); }
  catch { return []; }
}
function writeRecords(records) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

// ── API ───────────────────────────────────────────────
// 获取所有记录
app.get('/api/records', (req, res) => {
  const records = readRecords();
  const host = `${req.protocol}://${req.get('host')}`;
  const result = records.map(r => ({
    ...r,
    img: r.img ? `${host}/uploads/${r.img}` : null
  }));
  res.json(result);
});

// 新建记录
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
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除记录
app.delete('/api/records/:id', (req, res) => {
  const records = readRecords();
  const idx = records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '记录不存在' });
  const record = records[idx];
  // 删除关联图片
  if (record.img) {
    const imgPath = path.join(UPLOADS_DIR, record.img);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  records.splice(idx, 1);
  writeRecords(records);
  res.json({ success: true });
});

// ── 启动 ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Love Note 服务已启动: http://localhost:${PORT}`);
  console.log(`上传目录: ${UPLOADS_DIR}`);
  console.log(`数据文件: ${RECORDS_FILE}`);
});
