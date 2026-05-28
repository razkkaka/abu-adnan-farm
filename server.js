const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'abufarm-secret-2024';
const DB_PATH = './.abufarm.db';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(express.static(publicDir));

// Multer for image upload
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

let db;
function saveDb() { fs.writeFile(DB_PATH, Buffer.from(db.export()), err => { if (err) console.error(err); }); }
function run(sql, params = []) { db.run(sql, params); saveDb(); }
function get(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; } stmt.free(); return null; }
function all(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const res = []; while (stmt.step()) res.push(stmt.getAsObject()); stmt.free(); return res; }

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) { db = new SQL.Database(fs.readFileSync(DB_PATH)); console.log('✅ Database Dimuat'); }
  else { db = new SQL.Database(); console.log('✅ Database Baru Dibuat'); }

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, phone TEXT, role TEXT DEFAULT 'pembeli', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // Ternak: stok-based system, tag sekarang sebagai prefix/jenis, individual unit di tabel ternak_unit
  db.run(`CREATE TABLE IF NOT EXISTS ternak (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT, bobot INTEGER, umur TEXT, harga INTEGER,
    kondisi TEXT DEFAULT 'Sehat', image_url TEXT,
    stok INTEGER DEFAULT 1,
    deskripsi TEXT, sertifikat INTEGER DEFAULT 0,
    tag_prefix TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Individual unit/tag per ekor
  db.run(`CREATE TABLE IF NOT EXISTS ternak_unit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ternak_id INTEGER,
    tag TEXT UNIQUE,
    status TEXT DEFAULT 'Tersedia',
    pesanan_id TEXT,
    FOREIGN KEY(ternak_id) REFERENCES ternak(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pesanan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    user_id INTEGER,
    ternak_id INTEGER,
    jumlah INTEGER DEFAULT 1,
    tags_dibeli TEXT,
    total_harga INTEGER,
    status TEXT DEFAULT 'Menunggu Pembayaran',
    bukti_bayar TEXT,
    catatan TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pakan (id INTEGER PRIMARY KEY AUTOINCREMENT, jenis_pakan TEXT, stok_kg INTEGER, estimasi_hari INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS kesehatan (id INTEGER PRIMARY KEY AUTOINCREMENT, ternak_tag TEXT, tanggal DATE, riwayat_sakit TEXT, tindakan TEXT, jenis_vaksin TEXT)`);

  // SEEDER ADMIN
  if (!get("SELECT id FROM users WHERE role='admin'")) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Admin', 'admin@livestock.com', hash, 'admin']);
  }

  // SEEDER TERNAK dengan stok
  if (!get("SELECT id FROM ternak LIMIT 1")) {
    const T = [
      // [jenis, bobot, umur, harga, kondisi, image_url, stok, deskripsi, sertif, tag_prefix]
      ['Sapi Limousin', 320, '2 Tahun 2 Bulan', 22000000, 'Sehat', 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=500', 10, 'Sapi Limousin unggul dengan otot tebal dan pertumbuhan cepat. Telah divaksin lengkap.', 1, 'SL'],
      ['Sapi Bali', 280, '2 Tahun', 18500000, 'Sehat', 'https://images.unsplash.com/photo-1596733430284-f743728fc3eb?w=500', 8, 'Sapi Bali asli dengan bulu hitam mengkilap. Jinak dan mudah dirawat.', 1, 'SB'],
      ['Sapi Simental', 410, '3 Tahun', 32000000, 'Sehat', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Cow_female_black_white.jpg/640px-Cow_female_black_white.jpg', 5, 'Sapi Simental premium, bobot tertinggi di kandang kami. Ideal untuk qurban berkelompok.', 1, 'SS'],
      ['Sapi PO (Ongole)', 290, '2 Tahun 6 Bulan', 19800000, 'Sehat', 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=500', 7, 'Sapi PO asli Jawa, dagingnya lebih padat. Sangat cocok untuk qurban.', 0, 'SP'],
      ['Sapi Madura', 240, '2 Tahun', 16500000, 'Sehat', 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=500', 6, 'Sapi Madura berbobot ideal, lincah dan sehat. Sudah melewati pemeriksaan veteriner.', 0, 'SM'],
      ['Kambing Etawa', 45, '1 Tahun 6 Bulan', 3500000, 'Sehat', 'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=500', 15, 'Kambing Etawa jantan, tanduk panjang dan sehat. Sangat layak qurban.', 1, 'KE'],
      ['Kambing Boer', 52, '1 Tahun 8 Bulan', 4200000, 'Sehat', 'https://images.unsplash.com/photo-1588698188151-5b7c0cc247bf?w=500', 12, 'Kambing Boer import dengan bobot gemuk. Dagingnya tebal dan berkualitas tinggi.', 1, 'KB'],
      ['Kambing Kacang', 38, '1 Tahun 4 Bulan', 2800000, 'Sehat', 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=500', 20, 'Kambing Kacang lokal yang jinak dan sehat. Pilihan ekonomis namun berkualitas.', 0, 'KK'],
      ['Kambing Nubian', 58, '2 Tahun', 5500000, 'Sehat', 'https://images.unsplash.com/photo-1560743641-3914f2c45636?w=500', 4, 'Kambing Nubian premium dengan telinga panjang khas. Langka dan berkualitas.', 1, 'KN'],
      ['Domba Garut', 44, '1 Tahun 5 Bulan', 3900000, 'Sehat', 'https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=500', 9, 'Domba Garut asli dengan wol tebal. Sudah melewati karantina dan vaksinasi lengkap.', 1, 'DG'],
    ];

    for (const t of T) {
      db.run("INSERT INTO ternak (jenis,bobot,umur,harga,kondisi,image_url,stok,deskripsi,sertifikat,tag_prefix) VALUES (?,?,?,?,?,?,?,?,?,?)", t);
      const inserted = get("SELECT id FROM ternak ORDER BY id DESC LIMIT 1");
      // Generate individual unit tags
      for (let i = 1; i <= t[6]; i++) {
        const tag = `${t[9]}-${String(i).padStart(3,'0')}`;
        db.run("INSERT INTO ternak_unit (ternak_id, tag) VALUES (?,?)", [inserted.id, tag]);
      }
    }

    db.run(`INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES 
      ('Konsentrat Sapi', 150, 5), 
      ('Rumput Odot', 450, 10),
      ('Jagung Giling', 200, 8),
      ('Dedak Padi', 300, 12),
      ('Vitamin & Suplemen', 30, 15)`);

    db.run(`INSERT INTO kesehatan (ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin) VALUES
      ('SL-001', '2024-11-01', '-', 'Vaksinasi Rutin', 'Anthrax'),
      ('SB-001', '2024-11-01', '-', 'Vaksinasi Rutin', 'Anthrax'),
      ('KE-001', '2024-10-15', 'Batuk Ringan', 'Pemberian obat batuk + istirahat', '-'),
      ('KB-001', '2024-11-05', '-', 'Vaksinasi Rutin', 'PMK')`);
  }
  saveDb();
}

// MIDDLEWARES
const auth = (req, res, next) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ error: 'Akses ditolak' }); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Sesi habis' }); } };
const adminOnly = (req, res, next) => { auth(req, res, () => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya Admin' }); next(); }); };

// AUTH
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Semua field wajib diisi' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  try {
    run("INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)", [name, email, bcrypt.hashSync(password, 10), phone || '']);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'Email sudah terdaftar' }); }
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const u = get("SELECT * FROM users WHERE email=?", [email]);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Email atau password salah' });
  res.json({ token: jwt.sign({ id: u.id, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: '7d' }), user: { name: u.name, role: u.role, email: u.email } });
});

// IMAGE UPLOAD
app.post('/api/upload', adminOnly, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// PUBLIC
app.get('/api/ternak', (req, res) => {
  const data = all("SELECT * FROM ternak WHERE stok > 0 ORDER BY id DESC");
  res.json(data);
});
app.get('/api/ternak/:id', (req, res) => {
  const t = get("SELECT * FROM ternak WHERE id=?", [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const units = all("SELECT tag FROM ternak_unit WHERE ternak_id=? AND status='Tersedia'", [t.id]);
  t.available_tags = units.map(u => u.tag);
  res.json(t);
});

app.get('/api/stats/public', (req, res) => {
  res.json({
    total_ternak: get("SELECT COUNT(*) as c FROM ternak WHERE stok > 0")?.c || 0,
    total_terjual: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Lunas'")?.c || 0,
    total_pelanggan: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c || 0,
  });
});

// BUYER - PESAN (dengan jumlah)
app.post('/api/pesanan', auth, (req, res) => {
  const { ternak_id, jumlah, catatan } = req.body;
  const qty = parseInt(jumlah) || 1;
  const t = get("SELECT * FROM ternak WHERE id=?", [ternak_id]);
  if (!t) return res.status(400).json({ error: 'Hewan tidak ditemukan' });
  if (t.stok < qty) return res.status(400).json({ error: `Stok tidak cukup. Tersedia: ${t.stok} ekor` });

  // Ambil unit tags yang tersedia
  const units = all("SELECT * FROM ternak_unit WHERE ternak_id=? AND status='Tersedia' LIMIT ?", [ternak_id, qty]);
  if (units.length < qty) return res.status(400).json({ error: 'Stok unit tidak mencukupi' });

  const orderId = 'ORD-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  const tagsDibeli = units.map(u => u.tag).join(', ');
  const totalHarga = t.harga * qty;

  run("INSERT INTO pesanan (order_id, user_id, ternak_id, jumlah, tags_dibeli, total_harga, catatan) VALUES (?,?,?,?,?,?,?)",
    [orderId, req.user.id, ternak_id, qty, tagsDibeli, totalHarga, catatan || '']);

  // Update unit status & stok
  for (const u of units) {
    run("UPDATE ternak_unit SET status='Dipesan', pesanan_id=? WHERE id=?", [orderId, u.id]);
  }
  run("UPDATE ternak SET stok = stok - ? WHERE id=?", [qty, ternak_id]);

  res.json({ success: true, order_id: orderId, tags: tagsDibeli });
});

app.get('/api/pesanan/my', auth, (req, res) => {
  res.json(all("SELECT p.*, t.jenis, t.image_url, t.bobot, t.harga as harga_satuan FROM pesanan p JOIN ternak t ON p.ternak_id=t.id WHERE p.user_id=? ORDER BY p.id DESC", [req.user.id]));
});

// ADMIN
app.get('/api/admin/stats', adminOnly, (req, res) => {
  res.json({
    ternak: get("SELECT COUNT(*) as c FROM ternak")?.c || 0,
    tersedia: get("SELECT SUM(stok) as c FROM ternak")?.c || 0,
    sapi: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Sapi%'")?.c || 0,
    kambing: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Kambing%' OR jenis LIKE '%Domba%'")?.c || 0,
    omset: get("SELECT SUM(total_harga) as s FROM pesanan WHERE status='Lunas'")?.s || 0,
    pesanan_pending: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Menunggu Pembayaran'")?.c || 0,
    total_users: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c || 0,
  });
});

app.get('/api/admin/ternak', adminOnly, (req, res) => { res.json(all("SELECT * FROM ternak ORDER BY id DESC")); });

app.post('/api/admin/ternak', adminOnly, (req, res) => {
  const b = req.body;
  if (!b.jenis || !b.bobot || !b.harga) return res.status(400).json({ error: 'Field wajib kurang' });
  const prefix = (b.tag_prefix || b.jenis.substring(0,2).toUpperCase()).trim();
  const stok = parseInt(b.stok) || 1;
  run("INSERT INTO ternak (jenis,bobot,umur,harga,kondisi,image_url,stok,deskripsi,sertifikat,tag_prefix) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [b.jenis, b.bobot, b.umur || '', b.harga, b.kondisi || 'Sehat', b.image_url || '', stok, b.deskripsi || '', b.sertifikat || 0, prefix]);
  const inserted = get("SELECT id FROM ternak ORDER BY id DESC LIMIT 1");
  // Generate unit tags
  for (let i = 1; i <= stok; i++) {
    const tag = `${prefix}-${String(i).padStart(3,'0')}`;
    try { db.run("INSERT INTO ternak_unit (ternak_id, tag) VALUES (?,?)", [inserted.id, tag]); } catch(e) {}
  }
  saveDb();
  res.json({ success: true });
});

app.put('/api/admin/ternak/:id', adminOnly, (req, res) => {
  const b = req.body;
  run("UPDATE ternak SET jenis=?,bobot=?,umur=?,harga=?,kondisi=?,image_url=?,deskripsi=?,sertifikat=? WHERE id=?",
    [b.jenis, b.bobot, b.umur, b.harga, b.kondisi, b.image_url, b.deskripsi || '', b.sertifikat || 0, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/admin/ternak/:id', adminOnly, (req, res) => {
  run("DELETE FROM ternak_unit WHERE ternak_id=?", [req.params.id]);
  run("DELETE FROM ternak WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// PAKAN CRUD
app.get('/api/admin/pakan', adminOnly, (req, res) => { res.json(all("SELECT * FROM pakan")); });
app.post('/api/admin/pakan', adminOnly, (req, res) => {
  const { jenis_pakan, stok_kg, estimasi_hari } = req.body;
  run("INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES (?,?,?)", [jenis_pakan, stok_kg, estimasi_hari]);
  res.json({ success: true });
});
app.put('/api/admin/pakan/:id', adminOnly, (req, res) => {
  const { jenis_pakan, stok_kg, estimasi_hari } = req.body;
  run("UPDATE pakan SET jenis_pakan=?, stok_kg=?, estimasi_hari=? WHERE id=?", [jenis_pakan, stok_kg, estimasi_hari, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/admin/pakan/:id', adminOnly, (req, res) => {
  run("DELETE FROM pakan WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// KESEHATAN CRUD
app.get('/api/admin/kesehatan', adminOnly, (req, res) => { res.json(all("SELECT * FROM kesehatan ORDER BY tanggal DESC")); });
app.post('/api/admin/kesehatan', adminOnly, (req, res) => {
  const { ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin } = req.body;
  run("INSERT INTO kesehatan (ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin) VALUES (?,?,?,?,?)",
    [ternak_tag, tanggal, riwayat_sakit || '-', tindakan || '-', jenis_vaksin || '-']);
  res.json({ success: true });
});
app.put('/api/admin/kesehatan/:id', adminOnly, (req, res) => {
  const { ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin } = req.body;
  run("UPDATE kesehatan SET ternak_tag=?, tanggal=?, riwayat_sakit=?, tindakan=?, jenis_vaksin=? WHERE id=?",
    [ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/admin/kesehatan/:id', adminOnly, (req, res) => {
  run("DELETE FROM kesehatan WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// PESANAN ADMIN
app.get('/api/admin/pesanan', adminOnly, (req, res) => {
  res.json(all("SELECT p.*, u.name as buyer_name, u.email as buyer_email, u.phone as buyer_phone, t.jenis FROM pesanan p JOIN users u ON p.user_id=u.id JOIN ternak t ON p.ternak_id=t.id ORDER BY p.id DESC"));
});
app.put('/api/admin/pesanan/:id/status', adminOnly, (req, res) => {
  const { status } = req.body;
  run("UPDATE pesanan SET status=? WHERE id=?", [status, req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/users', adminOnly, (req, res) => { res.json(all("SELECT id,name,email,phone,role,created_at FROM users ORDER BY id DESC")); });

// AI CHATBOT
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  const info = all("SELECT jenis, bobot, harga, stok FROM ternak WHERE stok > 0");
  const stokInfo = info.map(t => `${t.jenis} (${t.bobot}kg, Rp${Number(t.harga).toLocaleString()}, stok:${t.stok})`).join('; ');
  const prompt = `Kamu adalah AbuBot, asisten virtual Abu Farm (peternakan Sapi & Kambing Qurban di Bogor). Jawab pertanyaan pelanggan dengan ramah, singkat, dan jelas dalam bahasa Indonesia. Stok tersedia: ${stokInfo}. Pertanyaan: "${message}"`;
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.json({ reply: autoReply(message.toLowerCase(), info) });
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }] }) });
    const d = await r.json();
    res.json({ reply: d.choices[0].message.content });
  } catch (e) { res.status(500).json({ reply: "Gagal terhubung ke server AI." }); }
});

function autoReply(msg, stok) {
  if (msg.includes('stok') || msg.includes('tersedia')) return `Stok saat ini: ${stok.map(t=>t.jenis+' ('+t.stok+' ekor)').join(', ')} 🐄`;
  if (msg.includes('harga') || msg.includes('berapa')) return 'Harga mulai Rp 2.800.000 (kambing) hingga Rp 32.000.000 (sapi premium). Cek halaman beranda untuk lengkapnya! 🐄';
  if (msg.includes('sapi')) return 'Kami punya Sapi Limousin, Bali, Simental, PO, dan Madura. Bobot 240–410 kg, semua sudah divaksin! 🐄';
  if (msg.includes('kambing') || msg.includes('domba')) return 'Tersedia Kambing Etawa, Boer, Kacang, Nubian, dan Domba Garut. Bobot 38–58 kg, sehat & layak qurban! 🐐';
  if (msg.includes('pesan') || msg.includes('beli') || msg.includes('order')) return 'Cara pesan: 1) Daftar akun, 2) Pilih hewan di Marketplace, 3) Tentukan jumlah, 4) Bayar DP 30%. Mudah! 😊';
  if (msg.includes('bayar') || msg.includes('dp') || msg.includes('transfer')) return 'Bayar DP 30% via Transfer BCA 1234-567-890 a/n Pak Admin. Kirim bukti ke WA: 0812-xxxx-xxxx dengan Order ID ya!';
  if (msg.includes('vaksin') || msg.includes('sehat')) return 'Semua hewan sudah vaksinasi lengkap (Anthrax, PMK). Hewan premium dilengkapi sertifikat kesehatan! ✅';
  if (msg.includes('lokasi') || msg.includes('kandang')) return 'Kandang di Bogor, Jawa Barat. Silakan kunjungi langsung! Hubungi dulu via WA ya 😊';
  if (msg.includes('halo') || msg.includes('hai') || msg.includes('hi')) return 'Halo! Selamat datang di Abu Farm 🐄 Bisa tanya tentang harga, stok, cara pesan, atau info lainnya!';
  return 'Terima kasih pertanyaannya! Hubungi kami via WhatsApp atau cek halaman beranda untuk katalog terkini. Ada yang bisa dibantu lagi? 😊';
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
['/dashboard', '/admin', '/login'].forEach(r => app.get(r, (req, res) => res.sendFile(path.join(__dirname, 'public', r + '.html'))));

initDb().then(() => app.listen(PORT, () => console.log(`🚀 Abu Farm running on port ${PORT}`)));