const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'abuadnan-farm-secret-2024';
const DB_PATH = './.abuadnan.db'; 

app.use(cors());
app.use(express.json());
// Buat folder public secara otomatis kalau belum ada
if (!fs.existsSync(path.join(__dirname, 'public'))) fs.mkdirSync(path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));

let db;
function saveDb() { fs.writeFile(DB_PATH, Buffer.from(db.export()), (err) => { if (err) console.error(err); }); }
function run(sql, params = []) { db.run(sql, params); saveDb(); }
function get(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; } stmt.free(); return null; }
function all(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const res = []; while (stmt.step()) res.push(stmt.getAsObject()); stmt.free(); return res; }

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) { db = new SQL.Database(fs.readFileSync(DB_PATH)); console.log('✅ Database Ternak Dimuat'); } 
  else { db = new SQL.Database(); console.log('✅ Database Ternak Dibuat'); }

  // TABEL SISTEM PETERNAKAN
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'pembeli', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS ternak (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT UNIQUE, jenis TEXT, bobot INTEGER, umur TEXT, harga INTEGER, kondisi TEXT, image_url TEXT, status TEXT DEFAULT 'Tersedia', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pesanan (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE, user_id INTEGER, ternak_id INTEGER, total_harga INTEGER, status TEXT DEFAULT 'Menunggu Pembayaran', bukti_bayar TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pakan (id INTEGER PRIMARY KEY AUTOINCREMENT, jenis_pakan TEXT, stok_kg INTEGER, estimasi_hari INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS kesehatan (id INTEGER PRIMARY KEY AUTOINCREMENT, ternak_tag TEXT, tanggal DATE, riwayat_sakit TEXT, tindakan TEXT, jenis_vaksin TEXT)`);

  // SEEDER ADMIN (PETERNAK)
  if (!get("SELECT id FROM users WHERE role='admin'")) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Pak Adnan (Admin)','admin@livestock.com',hash,'admin']);
  }

  // SEEDER DATA TERNAK AWAL
  if (!get("SELECT id FROM ternak LIMIT 1")) {
    const T = [
      ['S-101','Sapi Limousin', 320, '2 Tahun 2 Bulan', 22000000, 'Sehat', 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=500'],
      ['S-102','Sapi Bali', 280, '2 Tahun', 18500000, 'Sehat', 'https://images.unsplash.com/photo-1596733430284-f743728fc3eb?w=500'],
      ['K-042','Kambing Etawa', 45, '1 Tahun 6 Bulan', 3500000, 'Sehat', 'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=500'],
      ['K-045','Kambing Boer', 50, '1 Tahun 8 Bulan', 4200000, 'Sehat', 'https://images.unsplash.com/photo-1588698188151-5b7c0cc247bf?w=500']
    ];
    for (const t of T) db.run("INSERT INTO ternak (tag,jenis,bobot,umur,harga,kondisi,image_url) VALUES (?,?,?,?,?,?,?)", t);
    
    // Seeder Pakan
    db.run("INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES ('Konsentrat Sapi', 150, 5), ('Rumput Odot', 450, 10)");
  }
  saveDb();
}

// MIDDLEWARES
const auth = (req, res, next) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ error: 'Akses ditolak' }); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Sesi habis' }); } };
const adminOnly = (req, res, next) => { auth(req, res, () => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya Admin' }); next(); }); };

// AUTH ROUTES
app.post('/api/auth/register', (req, res) => { const { name, email, password } = req.body; try { run("INSERT INTO users (name,email,password) VALUES (?,?,?)", [name,email,bcrypt.hashSync(password, 10)]); res.json({success:true}); } catch(e) { res.status(400).json({error: 'Email terdaftar'}); } });
app.post('/api/auth/login', (req, res) => { const { email, password } = req.body; const u = get("SELECT * FROM users WHERE email=?", [email]); if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Login gagal' }); res.json({ token: jwt.sign({id:u.id, role:u.role, name:u.name}, JWT_SECRET, {expiresIn:'7d'}), user: {name: u.name, role: u.role} }); });

// PUBLIC API (MARKETPLACE)
app.get('/api/ternak', (req, res) => { res.json(all("SELECT * FROM ternak WHERE status='Tersedia' ORDER BY id DESC")); });

// BUYER API
app.post('/api/pesanan', auth, (req, res) => {
  const { ternak_id } = req.body; const t = get("SELECT * FROM ternak WHERE id=? AND status='Tersedia'", [ternak_id]);
  if(!t) return res.status(400).json({error: 'Ternak tidak tersedia'});
  const orderId = 'ORD-' + Math.floor(Math.random()*10000);
  run("INSERT INTO pesanan (order_id, user_id, ternak_id, total_harga) VALUES (?,?,?,?)", [orderId, req.user.id, ternak_id, t.harga]);
  run("UPDATE ternak SET status='Dipesan' WHERE id=?", [ternak_id]);
  res.json({success: true, order_id: orderId});
});
app.get('/api/pesanan/my', auth, (req, res) => { res.json(all("SELECT p.*, t.jenis, t.tag, t.image_url FROM pesanan p JOIN ternak t ON p.ternak_id=t.id WHERE p.user_id=? ORDER BY p.id DESC", [req.user.id])); });

// ADMIN API (MANAJEMEN KANDANG)
app.get('/api/admin/stats', adminOnly, (req, res) => { res.json({ ternak: get("SELECT COUNT(*) as c FROM ternak")?.c||0, sapi: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Sapi%'")?.c||0, kambing: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Kambing%'")?.c||0, omset: get("SELECT SUM(total_harga) as s FROM pesanan WHERE status='Lunas'")?.s||0 }); });
app.get('/api/admin/ternak', adminOnly, (req, res) => { res.json(all("SELECT * FROM ternak ORDER BY id DESC")); });
app.post('/api/admin/ternak', adminOnly, (req, res) => { const b = req.body; run("INSERT INTO ternak (tag,jenis,bobot,umur,harga,kondisi,image_url) VALUES (?,?,?,?,?,?,?)", [b.tag, b.jenis, b.bobot, b.umur, b.harga, b.kondisi, b.image_url]); res.json({success:true}); });
app.delete('/api/admin/ternak/:id', adminOnly, (req, res) => { run("DELETE FROM ternak WHERE id=?", [req.params.id]); res.json({success:true}); });
app.get('/api/admin/pakan', adminOnly, (req, res) => { res.json(all("SELECT * FROM pakan")); });

// GROQ AI (CHATBOT & PREDIKSI)
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  const prompt = `Kamu adalah AdnanBot, asisten virtual Abu Adnan Farm (peternakan Sapi & Kambing Qurban). Jawab pertanyaan pelanggan dengan ramah, singkat, dan jelas berbahasa Indonesia. Pertanyaan: "${message}"`;
  try {
    const key = process.env.GROQ_API_KEY; if(!key) return res.json({reply: "Maaf, sistem AI sedang offline (API Key belum di-set)."});
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json'}, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{role:"user", content: prompt}] }) });
    const d = await r.json(); res.json({reply: d.choices[0].message.content});
  } catch(e) { res.status(500).json({reply: "Gagal terhubung ke server AI."}); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
['/dashboard', '/admin', '/login'].forEach(r => app.get(r, (req, res) => res.sendFile(path.join(__dirname, 'public', r + '.html'))));

initDb().then(() => app.listen(PORT, () => console.log(`🚀 Abu Adnan Farm running on port ${PORT}`)));