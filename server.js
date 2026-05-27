const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'abufarm-secret-2024';
const DB_PATH = './.abufarm.db';

app.use(cors());
app.use(express.json({limit: '10mb'})); 

// Pastikan folder public ada
if (!fs.existsSync(path.join(__dirname, 'public'))) {
  fs.mkdirSync(path.join(__dirname, 'public'));
}

// Serve file statis
app.use(express.static(path.join(__dirname, 'public')));

let db;
function saveDb() { fs.writeFile(DB_PATH, Buffer.from(db.export()), (err) => { if (err) console.error(err); }); }
function run(sql, params = []) { db.run(sql, params); saveDb(); }
function get(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; } stmt.free(); return null; }
function all(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const res = []; while (stmt.step()) res.push(stmt.getAsObject()); stmt.free(); return res; }

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) { 
    db = new SQL.Database(fs.readFileSync(DB_PATH)); 
    console.log('✅ Database Dimuat'); 
  } else { 
    db = new SQL.Database(); 
    console.log('✅ Database Dibuat Baru'); 
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, phone TEXT, role TEXT DEFAULT 'pembeli', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS ternak (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT UNIQUE, jenis TEXT, bobot INTEGER, umur TEXT, harga INTEGER, kondisi TEXT, image_url TEXT, status TEXT DEFAULT 'Tersedia', deskripsi TEXT, sertifikat INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pesanan (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE, user_id INTEGER, jenis TEXT, jumlah INTEGER, detail_hewan TEXT, total_harga INTEGER, status TEXT DEFAULT 'Menunggu Pembayaran', bukti_bayar TEXT, catatan TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pakan (id INTEGER PRIMARY KEY AUTOINCREMENT, jenis_pakan TEXT, stok_kg INTEGER, estimasi_hari INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS kesehatan (id INTEGER PRIMARY KEY AUTOINCREMENT, ternak_tag TEXT, tanggal DATE, riwayat_sakit TEXT, tindakan TEXT, jenis_vaksin TEXT)`);

  if (!get("SELECT id FROM users WHERE role='admin'")) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Admin Abu Farm','admin@livestock.com',hash,'admin']);
  }

  if (!get("SELECT id FROM ternak LIMIT 1")) {
    const T = [
      ['S-101','Sapi Limousin', 320, '2 Tahun 2 Bulan', 22000000, 'Sehat', 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=500','Sapi Limousin unggul. Telah divaksin lengkap.',1],
      ['S-102','Sapi Bali', 280, '2 Tahun', 18500000, 'Sehat', 'https://images.unsplash.com/photo-1596733430284-f743728fc3eb?w=500','Sapi Bali asli bulu hitam mengkilap. Jinak dan sehat.',1],
      ['S-103','Sapi Simental', 410, '3 Tahun', 32000000, 'Sehat', 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=500','Sapi Simental premium, bobot tertinggi. Ideal untuk qurban.',1], 
      ['K-042','Kambing Etawa', 45, '1 Tahun 6 Bulan', 3500000, 'Sehat', 'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=500','Kambing Etawa jantan, tanduk panjang. Sangat layak qurban.',1],
      ['K-045','Kambing Boer', 52, '1 Tahun 8 Bulan', 4200000, 'Sehat', 'https://images.unsplash.com/photo-1588698188151-5b7c0cc247bf?w=500','Kambing Boer import bobot gemuk. Daging tebal.',1],
    ];
    for (const t of T) db.run("INSERT INTO ternak (tag,jenis,bobot,umur,harga,kondisi,image_url,deskripsi,sertifikat) VALUES (?,?,?,?,?,?,?,?,?)", t);
    db.run(`INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES ('Konsentrat Sapi', 150, 5), ('Rumput Odot', 450, 10)`);
    db.run(`INSERT INTO kesehatan (ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin) VALUES ('S-101', '2024-11-01', '-', 'Vaksinasi Rutin', 'Anthrax')`);
  }
  saveDb();
}

const auth = (req, res, next) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ error: 'Akses ditolak' }); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Sesi habis' }); } };
const adminOnly = (req, res, next) => { auth(req, res, () => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya Admin' }); next(); }); };

// API AUTH
app.post('/api/auth/register', (req, res) => { 
  const { name, email, password, phone } = req.body; 
  if (!name || !email || !password) return res.status(400).json({error: 'Semua field wajib diisi'});
  if (password.length < 6) return res.status(400).json({error: 'Password minimal 6 karakter'});
  try { run("INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)", [name, email, bcrypt.hashSync(password, 10), phone||'']); res.json({success:true}); } 
  catch(e) { res.status(400).json({error: 'Email sudah terdaftar'}); } 
});
app.post('/api/auth/login', (req, res) => { 
  const { email, password } = req.body; 
  const u = get("SELECT * FROM users WHERE email=?", [email]); 
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Email atau password salah' }); 
  res.json({ token: jwt.sign({id:u.id, role:u.role, name:u.name}, JWT_SECRET, {expiresIn:'7d'}), user: {name: u.name, role: u.role, email: u.email} }); 
});

// API PUBLIC
app.get('/api/ternak/katalog', (req, res) => { 
  const sql = `SELECT jenis, harga, image_url, deskripsi, sertifikat, COUNT(*) as stok, AVG(bobot) as avg_bobot, MAX(umur) as umur FROM ternak WHERE status='Tersedia' GROUP BY jenis, harga`;
  res.json(all(sql)); 
});
app.get('/api/stats/public', (req, res) => { res.json({ total_ternak: get("SELECT COUNT(*) as c FROM ternak WHERE status='Tersedia'")?.c||0, total_terjual: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Lunas'")?.c||0, total_pelanggan: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c||0 }); });

// API PEMBELI (SISTEM MULTI STOK)
app.post('/api/pesanan', auth, (req, res) => {
  const { jenis, jumlah, catatan } = req.body;
  const qty = parseInt(jumlah);
  if(qty < 1) return res.status(400).json({error: 'Jumlah pesanan minimal 1'});
  
  const ternakList = all("SELECT id, tag, harga FROM ternak WHERE jenis=? AND status='Tersedia' LIMIT ?", [jenis, qty]);
  if(ternakList.length < qty) return res.status(400).json({error: `Stok ${jenis} tidak mencukupi. Sisa stok: ${ternakList.length}`});

  const detail_hewan = ternakList.map(t => t.tag).join(', ');
  const total_harga = ternakList.reduce((sum, t) => sum + t.harga, 0);
  const orderId = 'ORD-' + Date.now().toString().slice(-6) + Math.floor(Math.random()*100);

  run("INSERT INTO pesanan (order_id, user_id, jenis, jumlah, detail_hewan, total_harga, catatan) VALUES (?,?,?,?,?,?,?)", [orderId, req.user.id, jenis, qty, detail_hewan, total_harga, catatan||'']);
  ternakList.forEach(t => run("UPDATE ternak SET status='Dipesan' WHERE id=?", [t.id]));
  
  res.json({success: true, order_id: orderId});
});
app.get('/api/pesanan/my', auth, (req, res) => { res.json(all("SELECT * FROM pesanan WHERE user_id=? ORDER BY id DESC", [req.user.id])); });

// API ADMIN (FULL CRUD EDIT HAPUS)
app.get('/api/admin/stats', adminOnly, (req, res) => { res.json({ ternak: get("SELECT COUNT(*) as c FROM ternak")?.c||0, tersedia: get("SELECT COUNT(*) as c FROM ternak WHERE status='Tersedia'")?.c||0, pesanan_pending: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Menunggu Pembayaran'")?.c||0, total_users: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c||0 }); });

app.get('/api/admin/ternak', adminOnly, (req, res) => { res.json(all("SELECT * FROM ternak ORDER BY id DESC")); });
app.post('/api/admin/ternak', adminOnly, (req, res) => { const b = req.body; run("INSERT INTO ternak (tag,jenis,bobot,umur,harga,kondisi,image_url,deskripsi,sertifikat) VALUES (?,?,?,?,?,?,?,?,?)", [b.tag,b.jenis,b.bobot,b.umur,b.harga,b.kondisi||'Sehat',b.image_url||'',b.deskripsi||'',b.sertifikat||0]); res.json({success:true}); });
app.put('/api/admin/ternak/:id', adminOnly, (req, res) => { const b = req.body; run("UPDATE ternak SET tag=?, jenis=?, bobot=?, umur=?, harga=?, status=?, image_url=? WHERE id=?", [b.tag, b.jenis, b.bobot, b.umur, b.harga, b.status, b.image_url, req.params.id]); res.json({success:true}); });
app.delete('/api/admin/ternak/:id', adminOnly, (req, res) => { run("DELETE FROM ternak WHERE id=?", [req.params.id]); res.json({success:true}); });

app.get('/api/admin/pakan', adminOnly, (req, res) => { res.json(all("SELECT * FROM pakan")); });
app.post('/api/admin/pakan', adminOnly, (req, res) => { const b=req.body; run("INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES (?,?,?)", [b.jenis_pakan, b.stok_kg, b.estimasi_hari]); res.json({success:true}); });
app.put('/api/admin/pakan/:id', adminOnly, (req, res) => { const b=req.body; run("UPDATE pakan SET jenis_pakan=?, stok_kg=?, estimasi_hari=? WHERE id=?", [b.jenis_pakan, b.stok_kg, b.estimasi_hari, req.params.id]); res.json({success:true}); });
app.delete('/api/admin/pakan/:id', adminOnly, (req, res) => { run("DELETE FROM pakan WHERE id=?", [req.params.id]); res.json({success:true}); });

app.get('/api/admin/kesehatan', adminOnly, (req, res) => { res.json(all("SELECT * FROM kesehatan ORDER BY tanggal DESC")); });
app.post('/api/admin/kesehatan', adminOnly, (req, res) => { const b=req.body; run("INSERT INTO kesehatan (ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin) VALUES (?,?,?,?,?)", [b.ternak_tag, b.tanggal, b.riwayat_sakit, b.tindakan, b.jenis_vaksin]); res.json({success:true}); });
app.put('/api/admin/kesehatan/:id', adminOnly, (req, res) => { const b=req.body; run("UPDATE kesehatan SET ternak_tag=?, tanggal=?, riwayat_sakit=?, tindakan=?, jenis_vaksin=? WHERE id=?", [b.ternak_tag, b.tanggal, b.riwayat_sakit, b.tindakan, b.jenis_vaksin, req.params.id]); res.json({success:true}); });
app.delete('/api/admin/kesehatan/:id', adminOnly, (req, res) => { run("DELETE FROM kesehatan WHERE id=?", [req.params.id]); res.json({success:true}); });

app.get('/api/admin/pesanan', adminOnly, (req, res) => { res.json(all("SELECT p.*, u.name as buyer_name, u.email as buyer_email FROM pesanan p JOIN users u ON p.user_id=u.id ORDER BY p.id DESC")); });
app.put('/api/admin/pesanan/:id/status', adminOnly, (req, res) => {
  const { status } = req.body;
  run("UPDATE pesanan SET status=? WHERE id=?", [status, req.params.id]);
  if (status === 'Lunas') {
    const order = get("SELECT detail_hewan FROM pesanan WHERE id=?", [req.params.id]);
    if(order) {
      const tags = order.detail_hewan.split(', ');
      tags.forEach(t => run("UPDATE ternak SET status='Terjual' WHERE tag=?", [t]));
    }
  }
  res.json({success:true});
});

app.get('/api/admin/users', adminOnly, (req, res) => { res.json(all("SELECT id,name,email,phone,role,created_at FROM users ORDER BY id DESC")); });
app.put('/api/admin/users/:id', adminOnly, (req, res) => { run("UPDATE users SET name=?, email=?, phone=?, role=? WHERE id=?", [req.body.name, req.body.email, req.body.phone, req.body.role, req.params.id]); res.json({success:true}); });
app.delete('/api/admin/users/:id', adminOnly, (req, res) => { run("DELETE FROM users WHERE id=?", [req.params.id]); res.json({success:true}); });

// API AI CHATBOT
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  const info = all("SELECT jenis, harga, COUNT(*) as stok FROM ternak WHERE status='Tersedia' GROUP BY jenis, harga");
  const stokInfo = info.map(t => `${t.jenis} (Stok: ${t.stok}, Rp${t.harga.toLocaleString()})`).join('; ');
  const prompt = `Kamu adalah AbuBot, asisten virtual Abu Farm (peternakan Sapi & Kambing Qurban di Bogor). Jawab pertanyaan pelanggan dengan ramah, singkat, dan jelas dalam bahasa Indonesia. Stok tersedia saat ini: ${stokInfo}. Pertanyaan: "${message}"`;
  
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) { return res.json({reply: autoReply(message.toLowerCase())}); }
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json'}, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{role:"user", content: prompt}] }) });
    const d = await r.json();
    res.json({reply: d.choices[0].message.content});
  } catch(e) { res.status(500).json({reply: "Gagal terhubung ke server AI."}); }
});

function autoReply(msg) {
  if (msg.includes('harga') || msg.includes('berapa')) return 'Harga ternak kami mulai dari Rp 2.800.000 (kambing) hingga Rp 32.000.000 (sapi premium). Silakan cek halaman beranda untuk daftar lengkap! 🐄';
  if (msg.includes('sapi')) return 'Kami memiliki beberapa jenis sapi tersedia: Limousin, Bali, dan Simental. Semua divaksin! 🐄';
  if (msg.includes('kambing') || msg.includes('domba')) return 'Kami menyediakan Kambing Etawa dan Boer. Semuanya sehat dan layak qurban! 🐐';
  if (msg.includes('pesan') || msg.includes('beli') || msg.includes('order')) return 'Cara memesan: 1) Login/Daftar, 2) Pilih hewan di Marketplace, 3) Masukkan jumlah, 4) Klik "Konfirmasi Pesanan", 5) Bayar DP via Transfer. Mudah kan? 😊';
  return 'Terima kasih pertanyaannya! Untuk informasi lebih lanjut, silakan hubungi WhatsApp kami atau kunjungi halaman Marketplace.';
}

// ROUTING UTAMA (MEMASTIKAN ALAMAT URL TIDAK NYASAR)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Fallback kalau url ngaco dilempar ke beranda
app.get('*', (req, res) => res.redirect('/'));

initDb().then(() => app.listen(PORT, () => console.log(`🚀 Abu Farm running on port ${PORT}`)));