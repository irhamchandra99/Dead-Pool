# Dead Pool — Spesifikasi Build (untuk Claude Code)

> **Status: sudah diimplementasikan di repo ini.** Kode adalah sumber kebenaran; perbedaan dari spesifikasi ini dicatat di `DECISIONS.md`.
>
> Dokumen ini adalah instruksi untuk Claude Code. Baca seluruhnya sebelum mulai.
> Konteks ide & pitch ada di `01-ide-dan-pitch.md` (tidak wajib dibaca untuk membangun).
>
> **Aturan untuk Claude Code:**
> - Kerjakan sesuai **Urutan pengerjaan** (bagian 10). Selesaikan satu langkah sampai acceptance criteria-nya lolos sebelum lanjut.
> - Kalau ada yang ambigu, pilih opsi **paling sederhana** yang tetap memenuhi acceptance criteria, lalu catat keputusannya di `DECISIONS.md`.
> - Jangan menambah fitur di luar scope (bagian 2). Waktu hackathon ±7 jam.
> - Detail jaringan Monad di bawah dicek 2026-10-24 dari docs resmi; kalau ada yang gagal, cek ulang https://docs.monad.xyz.

---

## 1. Ringkasan produk

Dead Pool adalah pool taruhan per hackathon (cohort):

1. **Penyelenggara** membuat pool: besar taruhan per tim, batas waktu join, waktu akhir (di produk nyata: 90 hari), masa sanggah, alamat AI juri, fee.
2. **Tim** join dengan mengirim taruhan (native MON) + URL repo GitHub.
3. **Sponsor** boleh menambah bonus ke pool kapan saja sebelum finalisasi.
4. Setelah waktu akhir, **AI juri** (service off-chain) memeriksa repo setiap tim, lalu memanggil `submitVerdict` dengan putusan *alive/dead* dan **alasan dalam bentuk teks** (disimpan di event log).
5. Selama **masa sanggah**, siapa pun boleh `challenge` dengan menaruh bond. **Arbiter** (penyelenggara, di MVP) memutuskan.
6. Setelah semua putusan final, siapa pun boleh `finalize`. Tim yang hidup `claim`: taruhan kembali + bagian rata dari taruhan tim yang mati (dikurangi fee) + bonus sponsor.

---

## 2. Scope

### Wajib (MVP)
- Satu smart contract `DeadPool.sol` (multi-pool), dengan test Foundry lengkap.
- Deploy ke **Monad testnet**.
- AI juri sebagai **script CLI** (bukan server) yang membaca pool, menilai repo, dan mengirim putusan on-chain.
- Frontend satu halaman pool: daftar tim + status, total TVL pool, join, fund bonus, lihat alasan AI, challenge, finalize, claim.
- Script seed demo (pool dengan waktu dipersingkat + 3–4 tim contoh).

### Sengaja TIDAK dibuat
- Token ERC-20 / stablecoin (pakai native MON saja).
- Penilaian berkala (mingguan); cukup satu putusan di akhir.
- Sinyal on-chain/user count (lihat bagian 6.5 — *stretch goal*).
- Arbitrase terdesentralisasi (voting, panel). Arbiter = penyelenggara pool.
- Upgradeability, multisig, indexer.

---

## 3. Stack & jaringan

| Bagian | Pilihan |
|---|---|
| Contract | Solidity `^0.8.24`, Foundry, OpenZeppelin (`ReentrancyGuard`) |
| AI juri | TypeScript (Node 20+), `viem`, `@anthropic-ai/sdk`, GitHub REST API |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + `wagmi` v2 + `viem` |
| LLM | Claude, model `claude-sonnet-5-5` (cek nama model terbaru di docs Anthropic kalau error) |

**Monad testnet** ([docs](https://docs.monad.xyz/developer-essentials/testnets)):
- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Native currency: `MON`
- Faucet: `https://faucet.monad.xyz`
- Block time ~300 ms, finality ~600 ms.
- Explorer & cara verifikasi contract: cek halaman docs di atas (MonadVision / Monadscan).

**Environment variables** (`.env`, jangan di-commit; sediakan `.env.example`):
```
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
DEPLOYER_PRIVATE_KEY=
JUDGE_PRIVATE_KEY=
DEAD_POOL_ADDRESS=
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
JUDGE_LOOKBACK_DAYS=90
JUDGE_MIN_MEANINGFUL_COMMITS=3
JUDGE_MIN_ACTIVE_DAYS=2
NEXT_PUBLIC_DEAD_POOL_ADDRESS=
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

---

## 4. Struktur repo

```
dead-pool/
├── contracts/                 # Foundry project
│   ├── foundry.toml
│   ├── src/DeadPool.sol
│   ├── test/DeadPool.t.sol
│   └── script/Deploy.s.sol
├── judge/                     # AI juri (CLI)
│   ├── package.json
│   ├── src/index.ts           # entry: node judge <poolId>
│   ├── src/github.ts          # ambil commit & diff
│   ├── src/llm.ts             # panggil Claude, validasi JSON
│   ├── src/decide.ts          # aturan alive/dead
│   ├── src/chain.ts           # baca pool, kirim verdict
│   └── verdicts/              # simpan JSON lengkap per tim
├── scripts/
│   ├── seed-demo.ts           # buat pool demo + join tim contoh
│   └── make-zombie-repo.sh    # buat repo dengan commit "kosong"
├── web/                       # Next.js frontend
├── .env.example
├── DECISIONS.md
└── README.md
```

---

## 5. Smart contract `DeadPool.sol`

### 5.1 Tipe data

```solidity
enum Verdict { Pending, Alive, Dead }

struct Pool {
    string  name;
    address organizer;      // juga arbiter di MVP
    address judge;          // alamat AI juri
    address treasury;       // penerima fee
    uint256 stakeAmount;    // taruhan per tim (wei MON), sama untuk semua tim
    uint256 challengeBond;  // bond untuk challenge (wei MON)
    uint64  joinDeadline;
    uint64  endTime;        // setelah ini juri boleh menilai
    uint64  challengeWindow;// detik, dihitung dari waktu verdict per tim
    uint16  feeBps;         // fee dari taruhan yang hangus, maks 2000 (20%)
    uint256 bonusTotal;
    uint256 teamCount;
    uint256 aliveCount;     // diisi saat finalize
    uint256 payoutPerAlive; // bagian tambahan per tim hidup, diisi saat finalize
    bool    finalized;
}

struct Team {
    address owner;
    string  repoUrl;        // https://github.com/owner/repo
    Verdict verdict;
    uint64  verdictAt;
    bytes32 reasonHash;     // keccak256 dari JSON lengkap putusan
    bool    challenged;     // ada challenge yang belum diputuskan
    address challenger;
    bool    claimed;
}
```

Storage:
- `mapping(uint256 => Pool) pools;` dan `uint256 poolCount;`
- `mapping(uint256 => mapping(uint256 => Team)) teams;` (poolId → teamId → Team; teamId mulai dari 0)
- `mapping(uint256 => mapping(address => uint256)) bonusOf;` (poolId → sponsor → jumlah)
- `mapping(uint256 => uint256) forfeitedBonds;` (bond challenge yang ditolak, masuk ke pool)

### 5.2 Fungsi

| Fungsi | Siapa | Syarat (`require` / custom error) | Efek |
|---|---|---|---|
| `createPool(string name, address judge, address treasury, uint256 stakeAmount, uint256 challengeBond, uint64 joinDeadline, uint64 endTime, uint64 challengeWindow, uint16 feeBps) returns (uint256 poolId)` | siapa pun (jadi organizer) | `stakeAmount > 0`; `block.timestamp < joinDeadline < endTime`; `feeBps <= 2000`; judge & treasury ≠ 0 | Simpan pool, emit `PoolCreated` |
| `join(uint256 poolId, string repoUrl) payable returns (uint256 teamId)` | tim | `block.timestamp < joinDeadline`; `msg.value == stakeAmount`; `bytes(repoUrl).length > 0` | Tambah tim, emit `TeamJoined` |
| `fundBonus(uint256 poolId) payable` | sponsor | `!finalized`; `msg.value > 0` | `bonusTotal += msg.value`, `bonusOf[sponsor] += msg.value`, emit `BonusFunded` |
| `submitVerdict(uint256 poolId, uint256 teamId, bool alive, bytes32 reasonHash, string reason)` | hanya `judge` | `block.timestamp >= endTime`; verdict tim masih `Pending`; `!finalized` | Set verdict, `verdictAt = now`, emit `VerdictSubmitted(poolId, teamId, alive, reasonHash, reason)` — **alasan lengkap ada di event** |
| `challenge(uint256 poolId, uint256 teamId, string evidence) payable` | siapa pun | verdict ≠ Pending; `now <= verdictAt + challengeWindow`; `!challenged`; `msg.value == challengeBond` | `challenged = true`, simpan challenger, emit `Challenged` |
| `resolveChallenge(uint256 poolId, uint256 teamId, bool upheld)` | hanya `organizer` | `challenged == true`; `!finalized` | Jika `upheld`: balik verdict (Alive↔Dead), kembalikan bond ke challenger. Jika tidak: `forfeitedBonds[poolId] += challengeBond`. `challenged = false`. Emit `ChallengeResolved` |
| `finalize(uint256 poolId)` | siapa pun | `!finalized`; `now >= endTime`; **semua** tim verdict ≠ Pending; **semua** tim `now > verdictAt + challengeWindow`; tidak ada tim `challenged` | Hitung pembagian (5.3), kirim fee ke treasury, set `finalized`, emit `PoolFinalized` |
| `claim(uint256 poolId, uint256 teamId)` | owner tim | `finalized`; verdict `Alive`; `!claimed`; `msg.sender == owner` | Kirim `stakeAmount + payoutPerAlive`, emit `Claimed` |
| `refundBonus(uint256 poolId)` | sponsor | `finalized`; `aliveCount == 0`; `bonusOf[sender] > 0` | Kembalikan bonus sponsor (kalau tidak ada yang hidup) |

View helpers (dipakai frontend & juri):
- `getPool(uint256 poolId) returns (Pool memory)`
- `getTeams(uint256 poolId) returns (Team[] memory)`
- `poolBalance(uint256 poolId) returns (uint256)` = total stake + bonus + forfeitedBonds yang belum dibayar (untuk tampilan TVL)

Gunakan `ReentrancyGuard` pada `claim`, `finalize`, `resolveChallenge`, `refundBonus`. Ikuti checks-effects-interactions. Transfer native pakai `call{value: ...}("")` dan cek hasilnya.

### 5.3 Rumus pembagian (di `finalize`)

```
A = jumlah tim Alive
D = jumlah tim Dead
forfeited   = D * stakeAmount
fee         = forfeited * feeBps / 10_000
distributable = forfeited - fee + bonusTotal + forfeitedBonds[poolId]

jika A > 0:
    payoutPerAlive = distributable / A
    dust = distributable - payoutPerAlive * A      → ke treasury
    kirim fee + dust ke treasury
jika A == 0:
    payoutPerAlive = 0
    kirim fee + (forfeited - fee) + forfeitedBonds ke treasury
    bonus sponsor bisa ditarik lewat refundBonus
```

**Contoh untuk test:** stake 10 MON, 5 tim, 2 Alive, 3 Dead, feeBps 1000 (10%), bonus 20 MON, tidak ada bond hangus.
- forfeited = 30, fee = 3, distributable = 30 − 3 + 20 = 47
- payoutPerAlive = 23,5 → setiap tim hidup klaim **10 + 23,5 = 33,5 MON**
- treasury menerima 3 MON (dust 0)

### 5.4 Events & errors

```solidity
event PoolCreated(uint256 indexed poolId, address indexed organizer, string name);
event TeamJoined(uint256 indexed poolId, uint256 indexed teamId, address indexed owner, string repoUrl);
event BonusFunded(uint256 indexed poolId, address indexed sponsor, uint256 amount);
event VerdictSubmitted(uint256 indexed poolId, uint256 indexed teamId, bool alive, bytes32 reasonHash, string reason);
event Challenged(uint256 indexed poolId, uint256 indexed teamId, address indexed challenger, string evidence);
event ChallengeResolved(uint256 indexed poolId, uint256 indexed teamId, bool upheld, bool aliveNow);
event PoolFinalized(uint256 indexed poolId, uint256 aliveCount, uint256 payoutPerAlive, uint256 fee);
event Claimed(uint256 indexed poolId, uint256 indexed teamId, address indexed owner, uint256 amount);
event BonusRefunded(uint256 indexed poolId, address indexed sponsor, uint256 amount);
```

Pakai custom errors (`error JoinClosed();`, `error WrongStake();`, `error NotJudge();`, `error TooEarly();`, `error AlreadyJudged();`, `error ChallengeWindowOver();`, `error NotOrganizer();`, `error NotFinalizable();`, `error NotAlive();`, `error AlreadyClaimed();`, dst.).

### 5.5 Test Foundry yang wajib (`test/DeadPool.t.sol`)

Pakai `vm.warp` untuk waktu, `vm.prank` untuk aktor, `vm.deal` untuk saldo.

- [ ] `createPool` menolak parameter waktu salah dan `feeBps > 2000`.
- [ ] `join` berhasil dengan stake tepat; gagal kalau stake salah; gagal setelah `joinDeadline`.
- [ ] `fundBonus` menambah `bonusTotal` dan `bonusOf`; gagal setelah finalize.
- [ ] `submitVerdict` gagal kalau bukan judge; gagal sebelum `endTime`; gagal kalau sudah dinilai; event berisi `reason` terbaca.
- [ ] `challenge` gagal tanpa bond yang tepat; gagal setelah window; gagal kalau sudah ada challenge aktif.
- [ ] `resolveChallenge` upheld membalik verdict dan mengembalikan bond; rejected memindahkan bond ke `forfeitedBonds`.
- [ ] `finalize` gagal kalau masih ada Pending / challenge aktif / window belum lewat.
- [ ] **Contoh 5.3** menghasilkan klaim 33,5 MON per tim hidup dan 3 MON ke treasury.
- [ ] `claim` gagal untuk tim Dead, gagal dua kali, gagal kalau bukan owner.
- [ ] Kasus `A == 0`: treasury menerima taruhan hangus, sponsor bisa `refundBonus`.
- [ ] Saldo contract = 0 setelah semua klaim (tidak ada dana nyangkut, kecuali yang memang belum diklaim).

**Acceptance criteria:** `forge test` hijau semua; `forge coverage` ≥ 90% untuk `DeadPool.sol`.

---

## 6. AI juri (`judge/`)

### 6.1 Cara pakai

```
cd judge && npm run judge -- <poolId>          # nilai semua tim Pending, kirim verdict
cd judge && npm run judge -- <poolId> --dry    # nilai tanpa kirim tx, cetak hasil
```

### 6.2 Alur per tim

1. Baca `getTeams(poolId)` via viem. Lewati tim yang verdict-nya bukan Pending.
2. Parse `repoUrl` → `owner/repo`. Kalau tidak valid → **Dead** dengan alasan "repo tidak valid".
3. **Ambil commit** (GitHub REST, pakai `GITHUB_TOKEN`):
   - `GET /repos/{owner}/{repo}/commits?since=<now - JUDGE_LOOKBACK_DAYS>&per_page=100` (paginate sampai maks 300 commit).
   - Kalau repo tidak ada / 404 → **Dead** ("repo tidak ditemukan").
   - Kalau 0 commit di window → **Dead** tanpa memanggil LLM ("tidak ada commit dalam N hari").
4. **Ambil diff** untuk maks 15 commit terbaru: `GET /repos/{owner}/{repo}/commits/{sha}` → `files[].filename, additions, deletions, patch`. Potong `patch` per file maks 1.500 karakter, total per commit maks 6.000 karakter.
5. Hitung sinyal deterministik: jumlah commit, jumlah hari aktif berbeda, jumlah author berbeda, total additions/deletions.
6. **Panggil LLM** (6.3) dengan sinyal + diff. Validasi output dengan schema (pakai `zod`). Kalau JSON invalid, ulangi sekali; kalau tetap gagal → jangan kirim verdict, laporkan error.
7. **Putusan akhir** (`decide.ts`):
   ```
   alive = llm.alive
        && llm.meaningful_commits >= JUDGE_MIN_MEANINGFUL_COMMITS
        && activeDays >= JUDGE_MIN_ACTIVE_DAYS
   ```
8. Simpan JSON lengkap ke `judge/verdicts/<poolId>-<teamId>.json`. Hitung `reasonHash = keccak256(JSON string)`.
9. Kirim `submitVerdict(poolId, teamId, alive, reasonHash, reasonSummary)` dengan `JUDGE_PRIVATE_KEY`. `reasonSummary` = `llm.summary` maks 600 karakter, diawali label: `"ALIVE: ..."`, `"DEAD: ..."`, atau `"ZOMBIE: ..."` (zombie = ada commit tapi tidak berarti).

### 6.3 Prompt LLM

System prompt:
```
You are the judge of "Dead Pool", a protocol where hackathon teams stake money that
their project is still alive. Decide if this project shows REAL continued development
in the review window. Count a commit as meaningful only if it changes product
behavior, adds/changes real code, tests, or substantive docs for a real feature.
NOT meaningful: whitespace/formatting-only, renaming only, empty or trivial README
edits, version bumps alone, auto-generated lockfile churn, reverts of own trivial
commits, commits that only exist to look active. Be skeptical; teams have an
incentive to fake activity. Respond ONLY with JSON matching the schema.
```

User message: repo URL, window, sinyal deterministik, lalu daftar commit (sha, tanggal, author, message, files + patch terpotong).

Output schema:
```json
{
  "alive": true,
  "meaningful_commits": 7,
  "trivial_commits": 2,
  "zombie_suspected": false,
  "red_flags": ["..."],
  "evidence": [{"sha": "abc123", "why": "adds staking UI and tests"}],
  "summary": "One paragraph, plain language, why alive/dead."
}
```

### 6.4 Acceptance criteria
- [ ] `--dry` pada repo aktif (mis. repo open source yang ramai) → `alive: true`.
- [ ] `--dry` pada repo mati (tidak ada commit 90 hari) → Dead tanpa memanggil LLM.
- [ ] `--dry` pada repo zombie dari `make-zombie-repo.sh` → Dead, label `ZOMBIE`, `zombie_suspected: true`.
- [ ] Mode normal mengirim tx dan event `VerdictSubmitted` terlihat dengan `reason` yang benar.
- [ ] File `verdicts/*.json` tersimpan dan `keccak256`-nya sama dengan `reasonHash` on-chain.

### 6.5 Stretch goal (hanya kalau waktu sisa)
- Sinyal on-chain: tim mendaftarkan alamat contract project-nya; juri menghitung jumlah log/tx dan alamat pengirim unik dalam window.
- Sinyal website: cek URL demo masih merespons 200.

---

## 7. Frontend (`web/`)

Satu halaman utama `/pool/[id]` (plus `/` yang mengarahkan ke pool demo).

**Header pool:** nama, countdown fase (Join → Building → Judging → Finalized), **TVL pool** (`poolBalance`) dalam MON, jumlah tim, total bonus sponsor.

**Grid tim** — kartu per tim:
- repo (link), owner (alamat pendek), stake
- status badge: ⏳ Pending · 🟢 Alive · 🪦 Dead · 🧟 Zombie (Dead dengan label ZOMBIE)
- alasan AI juri (dari event `VerdictSubmitted`, bisa di-expand)
- tombol **Challenge** (kalau dalam window; input evidence; kirim bond)
- tombol **Claim** (kalau finalized, Alive, dan wallet = owner)

**Bagian "Graveyard" 🪦:** daftar tim Dead dengan nisan bergaya lucu ("RIP my-defi-app · Died of no commits · 2026").

**Aksi:** Connect wallet (injected, Monad testnet 10143), Join (input repo URL, otomatis kirim `stakeAmount`), Fund Bonus, Finalize, (organizer) Resolve Challenge.

Data dibaca via `viem` (`getPool`, `getTeams`, `getLogs` untuk `VerdictSubmitted`). Polling tiap 2 detik cukup.

**Acceptance criteria:**
- [ ] Wallet bisa connect ke Monad testnet; kalau chain salah, ada tombol switch/add network.
- [ ] Join, fund bonus, challenge, finalize, claim semua bisa dilakukan dari UI dan status ter-update tanpa refresh manual.
- [ ] Alasan AI juri tampil per tim.
- [ ] TVL pool tampil dan berubah setelah join/fund bonus.

---

## 8. Demo setup

### 8.1 `scripts/make-zombie-repo.sh`
Membuat repo GitHub baru (pakai `gh` CLI) berisi commit-commit "palsu" tersebar di beberapa hari terakhir (pakai `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`): ubah spasi, tambah titik di README, bump versi. Minimal 8 commit di ≥ 3 hari berbeda, supaya lolos hitungan deterministik tapi **harus** tertangkap LLM.

### 8.2 `scripts/seed-demo.ts`
- `createPool("Monad Blitz Demo", judge, treasury, 1 MON, 0.5 MON, now+2min, now+4min, 60s, 1000)`
- 4 wallet tim join:
  1. **Aktif:** repo open source yang ramai (contoh yang jelas aktif).
  2. **Mati:** repo lama tanpa commit 90 hari (misalnya repo hackathon lama tim sendiri).
  3. **Zombie:** repo dari `make-zombie-repo.sh`.
  4. **Dead Pool sendiri:** repo project ini (untuk closer pitch).
- Wallet sponsor `fundBonus(2 MON)`.
- Cetak `poolId` dan link frontend.

> Catatan: di demo, "90 hari" disimulasikan jadi beberapa menit di sisi contract. Juri AI tetap menilai **riwayat asli** repo selama `JUDGE_LOOKBACK_DAYS` terakhir.

### 8.3 Skrip demo (±40 detik saat pitch)
1. Tampilkan pool: 4 tim, TVL, bonus sponsor. *"Empat tim sudah bertaruh."*
2. Waktu habis → jalankan `npm run judge -- <poolId>` (atau sudah jalan sebelumnya). Kartu berubah: 🟢 aktif, 🪦 mati, 🧟 zombie. Buka alasan zombie: *"AI membaca diff-nya — isinya cuma spasi dan titik."*
3. Tunjukkan event di explorer: alasan lengkap tersimpan on-chain.
4. Finalize → tim hidup klaim, saldo bertambah. *"Yang menyerah membayar yang bertahan."*
5. Tunjuk kartu Dead Pool sendiri: *"Dan ini kami. Cek lagi 90 hari dari sekarang."*

**Rencana cadangan:** rekam video demo yang sukses sebelum pitch, untuk jaga-jaga RPC/LLM lambat.

---

## 9. Definition of Done (keseluruhan)

- [ ] Contract ter-deploy di Monad testnet, alamat tercatat di `README.md`.
- [ ] `forge test` hijau.
- [ ] Juri AI menghasilkan 3 putusan berbeda (alive, dead, zombie) di pool demo.
- [ ] Alur penuh dari UI: join → fund bonus → verdict → (challenge opsional) → finalize → claim.
- [ ] `README.md` berisi cara menjalankan semuanya dalam ≤ 10 perintah.
- [ ] Video demo cadangan terekam.

---

## 10. Urutan pengerjaan (±7 jam)

| # | Langkah | Estimasi | Selesai kalau |
|---|---|---|---|
| 1 | Init monorepo, Foundry, `.env.example`, `DECISIONS.md` | 15 mnt | `forge build` jalan |
| 2 | `DeadPool.sol` + test 5.5 | 75 mnt | Acceptance 5.5 lolos |
| 3 | `Deploy.s.sol` + deploy ke testnet | 15 mnt | Alamat contract ada, `getPool` bisa dipanggil |
| 4 | `make-zombie-repo.sh` + `seed-demo.ts` | 30 mnt | Pool demo dengan 4 tim terlihat on-chain |
| 5 | Juri AI (`github.ts` → `llm.ts` → `decide.ts` → `chain.ts`) | 90 mnt | Acceptance 6.4 lolos |
| 6 | Frontend | 120 mnt | Acceptance 7 lolos |
| 7 | Gladi demo end-to-end 2×, rekam video cadangan | 30 mnt | Definition of Done terpenuhi |
| — | Buffer | 45 mnt | — |

Kalau waktu mepet, potong dengan urutan ini: fitur challenge di UI → Graveyard → polling otomatis. **Jangan** potong juri AI dan demo zombie, karena itu inti pitch.
