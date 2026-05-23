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

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, phone TEXT, role TEXT DEFAULT 'pembeli', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS ternak (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT UNIQUE, jenis TEXT, ras TEXT, bobot INTEGER, umur TEXT, harga INTEGER, kondisi TEXT, image_url TEXT, status TEXT DEFAULT 'Tersedia', deskripsi TEXT, sertifikat INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pesanan (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE, user_id INTEGER, ternak_id INTEGER, total_harga INTEGER, status TEXT DEFAULT 'Menunggu Pembayaran', bukti_bayar TEXT, catatan TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS pakan (id INTEGER PRIMARY KEY AUTOINCREMENT, jenis_pakan TEXT, stok_kg INTEGER, estimasi_hari INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS kesehatan (id INTEGER PRIMARY KEY AUTOINCREMENT, ternak_tag TEXT, tanggal DATE, riwayat_sakit TEXT, tindakan TEXT, jenis_vaksin TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS ulasan (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, ternak_id INTEGER, bintang INTEGER, komentar TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // SEEDER ADMIN
  if (!get("SELECT id FROM users WHERE role='admin'")) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Pak Adnan (Admin)','admin@livestock.com',hash,'admin']);
  }

  // SEEDER TERNAK LENGKAP
  if (!get("SELECT id FROM ternak LIMIT 1")) {
    const T = [
      ['S-101','Sapi Limousin','Limousin', 320, '2 Tahun 2 Bulan', 22000000, 'Sehat', 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=500','Sapi Limousin unggul dengan otot tebal dan pertumbuhan cepat. Telah divaksin lengkap.',1],
      ['S-102','Sapi Bali','Bali', 280, '2 Tahun', 18500000, 'Sehat', 'https://images.unsplash.com/photo-1596733430284-f743728fc3eb?w=500','Sapi Bali asli dengan bulu hitam mengkilap. Jinak dan mudah dirawat.',1],
      ['S-103','Sapi Simental','Simental', 410, '3 Tahun', 32000000, 'Sehat', 'https://images.unsplash.com/photo-1527153818091-1a9638521e2a?w=500','Sapi Simental premium, bobot tertinggi di kandang kami. Ideal untuk qurban berkelompok.',1],
      ['S-104','Sapi PO (Ongole)','Peranakan Ongole', 290, '2 Tahun 6 Bulan', 19800000, 'Sehat', 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=500','Sapi PO asli Jawa, dagingnya lebih padat. Sangat cocok untuk qurban.',0],
      ['S-105','Sapi Madura','Madura', 240, '2 Tahun', 16500000, 'Sehat', 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=500','Sapi Madura berbobot ideal, lincah dan sehat. Sudah melewati pemeriksaan veteriner.',0],
      ['K-042','Kambing Etawa','Etawa', 45, '1 Tahun 6 Bulan', 3500000, 'Sehat', 'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=500','Kambing Etawa jantan, tanduk panjang dan sehat. Sangat layak qurban.',1],
      ['K-045','Kambing Boer','Boer', 52, '1 Tahun 8 Bulan', 4200000, 'Sehat', 'https://images.unsplash.com/photo-1588698188151-5b7c0cc247bf?w=500','Kambing Boer import dengan bobot gemuk. Dagingnya tebal dan berkualitas tinggi.',1],
      ['K-047','Kambing Kacang','Kacang', 38, '1 Tahun 4 Bulan', 2800000, 'Sehat', 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=500','Kambing Kacang lokal yang jinak dan sehat. Pilihan ekonomis namun berkualitas.',0],
      ['K-051','Kambing Nubian','Nubian', 58, '2 Tahun', 5500000, 'Sehat', 'https://images.unsplash.com/photo-1560743641-3914f2c45636?w=500','Kambing Nubian premium dengan telinga panjang khas. Langka dan berkualitas.',1],
      ['K-055','Domba Garut','Garut', 44, '1 Tahun 5 Bulan', 3900000, 'Sehat', 'https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=500','Domba Garut asli dengan wol tebal. Sudah melewati karantina dan vaksinasi lengkap.',1],
    ];
    for (const t of T) db.run("INSERT INTO ternak (tag,jenis,ras,bobot,umur,harga,kondisi,image_url,deskripsi,sertifikat) VALUES (?,?,?,?,?,?,?,?,?,?)", t);

    db.run(`INSERT INTO pakan (jenis_pakan, stok_kg, estimasi_hari) VALUES 
      ('Konsentrat Sapi', 150, 5), 
      ('Rumput Odot', 450, 10),
      ('Jagung Giling', 200, 8),
      ('Dedak Padi', 300, 12),
      ('Vitamin & Suplemen', 30, 15)`);

    // Seeder kesehatan
    db.run(`INSERT INTO kesehatan (ternak_tag, tanggal, riwayat_sakit, tindakan, jenis_vaksin) VALUES
      ('S-101', '2024-11-01', '-', 'Vaksinasi Rutin', 'Anthrax'),
      ('S-102', '2024-11-01', '-', 'Vaksinasi Rutin', 'Anthrax'),
      ('K-042', '2024-10-15', 'Batuk Ringan', 'Pemberian obat batuk + istirahat', '-'),
      ('K-045', '2024-11-05', '-', 'Vaksinasi Rutin', 'PMK')`);
  }
  saveDb();
}

// MIDDLEWARES
const auth = (req, res, next) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ error: 'Akses ditolak' }); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Sesi habis' }); } };
const adminOnly = (req, res, next) => { auth(req, res, () => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya Admin' }); next(); }); };

// AUTH
app.post('/api/auth/register', (req, res) => { 
  const { name, email, password, phone } = req.body; 
  if (!name || !email || !password) return res.status(400).json({error: 'Semua field wajib diisi'});
  if (password.length < 6) return res.status(400).json({error: 'Password minimal 6 karakter'});
  try { 
    run("INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)", [name, email, bcrypt.hashSync(password, 10), phone||'']); 
    res.json({success:true}); 
  } catch(e) { res.status(400).json({error: 'Email sudah terdaftar'}); } 
});
app.post('/api/auth/login', (req, res) => { 
  const { email, password } = req.body; 
  const u = get("SELECT * FROM users WHERE email=?", [email]); 
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Email atau password salah' }); 
  res.json({ token: jwt.sign({id:u.id, role:u.role, name:u.name}, JWT_SECRET, {expiresIn:'7d'}), user: {name: u.name, role: u.role, email: u.email} }); 
});

// PUBLIC
app.get('/api/ternak', (req, res) => { res.json(all("SELECT * FROM ternak WHERE status='Tersedia' ORDER BY id DESC")); });
app.get('/api/ternak/:id', (req, res) => { const t = get("SELECT * FROM ternak WHERE id=?", [req.params.id]); t ? res.json(t) : res.status(404).json({error:'Not found'}); });

// STATS public
app.get('/api/stats/public', (req, res) => {
  res.json({
    total_ternak: get("SELECT COUNT(*) as c FROM ternak WHERE status='Tersedia'")?.c||0,
    total_terjual: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Lunas'")?.c||0,
    total_pelanggan: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c||0,
  });
});

// BUYER
app.post('/api/pesanan', auth, (req, res) => {
  const { ternak_id, catatan } = req.body;
  const t = get("SELECT * FROM ternak WHERE id=? AND status='Tersedia'", [ternak_id]);
  if(!t) return res.status(400).json({error: 'Ternak tidak tersedia atau sudah dipesan'});
  const orderId = 'ORD-' + Date.now().toString().slice(-6) + Math.floor(Math.random()*100);
  run("INSERT INTO pesanan (order_id, user_id, ternak_id, total_harga, catatan) VALUES (?,?,?,?,?)", [orderId, req.user.id, ternak_id, t.harga, catatan||'']);
  run("UPDATE ternak SET status='Dipesan' WHERE id=?", [ternak_id]);
  res.json({success: true, order_id: orderId});
});
app.get('/api/pesanan/my', auth, (req, res) => { res.json(all("SELECT p.*, t.jenis, t.tag, t.image_url, t.bobot FROM pesanan p JOIN ternak t ON p.ternak_id=t.id WHERE p.user_id=? ORDER BY p.id DESC", [req.user.id])); });

// ADMIN
app.get('/api/admin/stats', adminOnly, (req, res) => { 
  res.json({ 
    ternak: get("SELECT COUNT(*) as c FROM ternak")?.c||0, 
    tersedia: get("SELECT COUNT(*) as c FROM ternak WHERE status='Tersedia'")?.c||0,
    sapi: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Sapi%'")?.c||0, 
    kambing: get("SELECT COUNT(*) as c FROM ternak WHERE jenis LIKE '%Kambing%' OR jenis LIKE '%Domba%'")?.c||0, 
    omset: get("SELECT SUM(total_harga) as s FROM pesanan WHERE status='Lunas'")?.s||0,
    pesanan_pending: get("SELECT COUNT(*) as c FROM pesanan WHERE status='Menunggu Pembayaran'")?.c||0,
    total_users: get("SELECT COUNT(*) as c FROM users WHERE role='pembeli'")?.c||0,
  }); 
});
app.get('/api/admin/ternak', adminOnly, (req, res) => { res.json(all("SELECT * FROM ternak ORDER BY id DESC")); });
app.post('/api/admin/ternak', adminOnly, (req, res) => { 
  const b = req.body; 
  run("INSERT INTO ternak (tag,jenis,ras,bobot,umur,harga,kondisi,image_url,deskripsi,sertifikat) VALUES (?,?,?,?,?,?,?,?,?,?)", [b.tag,b.jenis,b.ras||'',b.bobot,b.umur,b.harga,b.kondisi||'Sehat',b.image_url||'',b.deskripsi||'',b.sertifikat||0]); 
  res.json({success:true}); 
});
app.put('/api/admin/ternak/:id', adminOnly, (req, res) => {
  const b = req.body;
  run("UPDATE ternak SET jenis=?,bobot=?,umur=?,harga=?,status=?,kondisi=? WHERE id=?", [b.jenis,b.bobot,b.umur,b.harga,b.status,b.kondisi,req.params.id]);
  res.json({success:true});
});
app.delete('/api/admin/ternak/:id', adminOnly, (req, res) => { run("DELETE FROM ternak WHERE id=?", [req.params.id]); res.json({success:true}); });
app.get('/api/admin/pakan', adminOnly, (req, res) => { res.json(all("SELECT * FROM pakan")); });
app.get('/api/admin/pesanan', adminOnly, (req, res) => { res.json(all("SELECT p.*, u.name as buyer_name, u.email as buyer_email, t.jenis, t.tag FROM pesanan p JOIN users u ON p.user_id=u.id JOIN ternak t ON p.ternak_id=t.id ORDER BY p.id DESC")); });
app.put('/api/admin/pesanan/:id/status', adminOnly, (req, res) => {
  const { status } = req.body;
  run("UPDATE pesanan SET status=? WHERE id=?", [status, req.params.id]);
  if (status === 'Lunas') run("UPDATE ternak SET status='Terjual' WHERE id=(SELECT ternak_id FROM pesanan WHERE id=?)", [req.params.id]);
  res.json({success:true});
});
app.get('/api/admin/users', adminOnly, (req, res) => { res.json(all("SELECT id,name,email,phone,role,created_at FROM users ORDER BY id DESC")); });
app.get('/api/admin/kesehatan', adminOnly, (req, res) => { res.json(all("SELECT * FROM kesehatan ORDER BY tanggal DESC")); });

// AI CHATBOT
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  const info = all("SELECT tag, jenis, bobot, harga, status FROM ternak WHERE status='Tersedia'");
  const stokInfo = info.map(t => `${t.tag} (${t.jenis}, ${t.bobot}kg, Rp${t.harga.toLocaleString()}, ${t.status})`).join('; ');
  const prompt = `Kamu adalah AdnanBot, asisten virtual Abu Adnan Farm (peternakan Sapi & Kambing Qurban di Bogor). Jawab pertanyaan pelanggan dengan ramah, singkat, dan jelas dalam bahasa Indonesia. Stok tersedia saat ini: ${stokInfo}. Pertanyaan: "${message}"`;
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      const auto = autoReply(message.toLowerCase());
      return res.json({reply: auto});
    }
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json'}, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{role:"user", content: prompt}] }) });
    const d = await r.json();
    res.json({reply: d.choices[0].message.content});
  } catch(e) { res.status(500).json({reply: "Gagal terhubung ke server AI."}); }
});

function autoReply(msg) {
  if (msg.includes('harga') || msg.includes('berapa')) return 'Harga ternak kami mulai dari Rp 2.800.000 (kambing) hingga Rp 32.000.000 (sapi premium). Silakan cek halaman beranda untuk daftar lengkap! 🐄';
  if (msg.includes('sapi')) return 'Kami memiliki beberapa jenis sapi tersedia: Limousin, Bali, Simental, PO, dan Madura. Bobot mulai 240 kg hingga 410 kg. Semua sudah divaksin! 🐄';
  if (msg.includes('kambing') || msg.includes('domba')) return 'Kami menyediakan Kambing Etawa, Boer, Kacang, Nubian, dan Domba Garut. Bobot mulai 38-58 kg. Semuanya sehat dan layak qurban! 🐐';
  if (msg.includes('pesan') || msg.includes('beli') || msg.includes('order')) return 'Cara memesan: 1) Daftar akun di halaman Login, 2) Pilih hewan di halaman Beranda, 3) Klik "Pesan Sekarang", 4) Bayar DP via Transfer. Mudah kan? 😊';
  if (msg.includes('bayar') || msg.includes('dp') || msg.includes('transfer')) return 'Kami menerima pembayaran via Transfer Bank (BCA/Mandiri/BRI). DP minimal 30% untuk konfirmasi pesanan. Hubungi admin via WhatsApp untuk nomor rekening ya!';
  if (msg.includes('vaksin') || msg.includes('sehat') || msg.includes('kesehatan')) return 'Semua hewan kami sudah melalui pemeriksaan veteriner dan vaksinasi lengkap (Anthrax, PMK, dll). Kami juga menyertakan sertifikat kesehatan untuk hewan premium! ✅';
  if (msg.includes('lokasi') || msg.includes('alamat') || msg.includes('kandang')) return 'Kandang kami berlokasi di Bogor, Jawa Barat. Pembeli bisa melakukan kunjungan langsung untuk melihat hewan sebelum membeli. Hubungi kami terlebih dahulu ya!';
  if (msg.includes('halo') || msg.includes('hai') || msg.includes('hi')) return 'Halo! Selamat datang di AbuAdnan Farm 🐄 Ada yang bisa saya bantu? Anda bisa tanya tentang harga, cara pesan, atau jenis hewan yang tersedia!';
  return 'Terima kasih pertanyaannya! Untuk informasi lebih lanjut, Anda bisa menghubungi kami via WhatsApp atau kunjungi halaman beranda untuk melihat katalog hewan terkini. Ada yang ingin ditanyakan lagi? 😊';
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
['/dashboard', '/admin', '/login'].forEach(r => app.get(r, (req, res) => res.sendFile(path.join(__dirname, 'public', r + '.html'))));

initDb().then(() => app.listen(PORT, () => console.log(`🚀 Abu Adnan Farm running on port ${PORT}`)));