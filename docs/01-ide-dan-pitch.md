# Dead Pool — Ide & Pitch

> **Dead Pool** — *Put your money where your demo is.*
>
> *"Taruh uang bahwa project-mu masih hidup 90 hari lagi. Yang menyerah, bayar yang bertahan."*

Untuk **Monad Blitz Jogja**. Baca bagian 1–6, sekitar 12 menit. Lampiran di bawahnya tidak wajib dibaca, buka hanya kalau juri bertanya soal sumber.

Cara membangunnya ada di `02-build.md`.

- Prototipe tampilan aplikasi: https://claude.ai/artifact/CcfudBeb9cUstyky3eisNJ
- Slide pitch (lengkap dengan catatan ucapan di setiap slide): https://claude.ai/artifact/LRY3DvpFCTdK8KYk35x2sj

---

## 1. Gampangnya

Bayangkan kamu dan 7 teman **taruhan diet**. Masing-masing setor Rp500 ribu. Tiga bulan lagi, yang berhasil turun berat badan dapat uangnya kembali, **ditambah uang teman-teman yang gagal**.

Dead Pool sama persis, tapi untuk **project hackathon**:

1. **Setor.** Setiap tim menaruh uang untuk project-nya sendiri: "project kami masih jalan 3 bulan lagi."
2. **Tunggu 90 hari.** Tim tetap mengerjakan project-nya.
3. **Dicek.** AI membaca kode tim di GitHub. Kalau ada pengembangan sungguhan, project-nya **hidup**. Kalau tidak ada apa-apa, atau cuma pura-pura sibuk, project-nya **mati**.
4. **Bagi uang.** Tim yang project-nya hidup mendapat uang dari tim yang project-nya mati, ditambah bonus dari sponsor.

Singkatnya: **yang menyerah membayar yang bertahan.**

**Kenapa namanya Dead Pool?** Di luar negeri, *dead pool* adalah nama permainan taruhan menebak siapa yang mati duluan. Di sini artinya juga harfiah: kumpulan uang (*pool*) dari project-project yang mati.

---

## 2. Contoh: Pool Blitz Jogja

**Sebelum 90 hari:**
- 8 tim ikut, masing-masing menaruh **50 MON**. **MON** adalah mata uang blockchain Monad.
- Sponsor menambah **bonus 300 MON** untuk tim yang bertahan.
- Total yang terkunci **700 MON**. Angka ini disebut **TVL** (*total value locked*), yaitu jumlah uang yang terkunci di sebuah aplikasi crypto.

**Setelah 90 hari, AI menilai:**
- 4 tim **hidup**.
- 4 tim **mati**: 2 benar-benar diam, dan 2 **zombie**. Zombie artinya ada perubahan kode, tapi isinya cuma ganti spasi, naik versi atau tambah titik. Kelihatannya hidup, padahal tidak.

Setiap putusan dan alasannya dicatat langsung di blockchain, jadi siapa pun bisa memeriksanya dan tidak ada yang bisa mengubahnya. Setelah itu ada **masa sanggah** singkat: siapa pun yang merasa AI salah boleh mengajukan keberatan.

**Pembagian uang:**

| | |
|---|---|
| Uang dari 4 tim yang mati (4 × 50) | 200 MON |
| Dipotong 10% untuk Dead Pool (pendapatan kami) | −20 MON |
| Ditambah bonus sponsor | +300 MON |
| **Dibagi rata ke 4 tim yang hidup** | **120 MON per tim** |
| **Yang diterima setiap tim yang hidup** | **50 (uangnya sendiri) + 120 = 170 MON** |

Tim yang bertahan pulang membawa **3,4 kali** uang yang mereka setor.

---

## 3. Dead Pool bukan platform hackathon

Dead Pool **bukan** saingan DoraHacks, HackQuest, atau Luma. Mereka mengurus **selama** lomba: pendaftaran, pengumpulan project, penjurian, hadiah. Dead Pool mengurus **90 hari setelahnya**.

Perumpamaannya: platform hackathon itu **stadionnya**, sedangkan Dead Pool itu **taruhan apakah sebuah tim masih bermain musim depan**.

Karena itu, platform-platform tadi justru calon partner. Misalnya, DoraHacks bisa menambahkan tombol "Join Dead Pool" di setiap halaman project.

---

## 4. Naskah pitch (2,5 menit)

**Slide 1: Pembuka (20 detik)**
> "Kurang dari 10% project hackathon masih hidup dua bulan setelah acara. Monad sudah bikin lebih dari 50 Blitz, termasuk di Jogja bulan April lalu. Coba hitung, berapa yang masih tersisa."

**Slide 2: Kenapa ini masalah (15 detik)**
> "Ekosistem crypto membagikan uang besar ke developer. Arbitrum saja menghabiskan sekitar 100 juta dolar untuk satu program, lalu melihat orang-orangnya pergi begitu uangnya habis. Tidak ada yang menagih janji mereka."

**Slide 3: Solusinya (15 detik)**
> "Makanya kami bikin Dead Pool: tempat taruhan project hackathon mana yang mati duluan. *(jeda sebentar)* Setiap tim menaruh uang di project-nya sendiri. Yang project-nya tetap hidup, dibayar oleh yang menyerah. *Put your money where your demo is.*"

**Slide 4: Cara kerjanya (20 detik)**
> Tampilkan contoh bagian 2: 8 tim × 50 MON + bonus 300 MON → 90 hari → AI membaca kode di GitHub → masa sanggah → 4 tim yang hidup masing-masing pulang membawa 170 MON.

**Slide 5: Buktinya (20 detik)**
> "Ini bukan teori. Ada eksperimen di Filipina: perokok yang menaruh uangnya sendiri, peluang berhentinya naik lebih dari sepertiga, dan bertahan sampai setahun. Judul paper-nya *Put Your Money Where Your Butt Is.*"

**Slide 6: Demo (40 detik)**: angkanya sama persis dengan slide 4.
> 1. Buka pool demo. *"Delapan tim sudah bertaruh, masing-masing 50 MON, plus bonus sponsor 300."*
> 2. Klik **Run judge**. Status berubah: 4 hidup, 2 zombie, 2 mati. Klik baris **totally-active-app**: *"AI membaca isi perubahannya, isinya cuma spasi, titik, dan naik versi. Alasannya tersimpan di blockchain."*
> 3. Tunggu tombol **Challenges close in…** habis (itu masa sanggah), lalu klik **Pay survivors**. *"Setiap yang bertahan dapat +120, pulang bawa 170. Yang menyerah membayar yang bertahan."*

**Slide 7: Kenapa Monad (15 detik)**
> "Ini masalah Monad sendiri. Karena biaya di Monad murah, setiap alasan AI bisa disimpan lengkap di blockchain, jadi siapa pun bisa memeriksa hakimnya. Hackathon hanya tempat uji coba. Pasar yang sebenarnya adalah grant."

**Slide 8: Penutup (5 detik)**
> "Dan project kami sendiri sudah kami taruhkan. Tiga bulan lagi, silakan cek: kami masih hidup atau tidak."

**Kenapa pitch ini lucu:** kalimat "tempat taruhan project hackathon mana yang mati duluan" terdengar kejam, jadi juri sempat kaget. Sedetik kemudian, "yang project-nya tetap hidup dibayar oleh yang menyerah" membuatnya langsung masuk akal. Kaget yang cepat terjawab membuat orang tertawa, dan membuat juri ingat project ini waktu memilih pemenang. Jadi jangan dibalik: kalimat yang mengagetkan dulu, penjelasannya menyusul.

---

## 5. Cara menjalankan demo (untuk Doni)

Demo utama berjalan di **Monad testnet** (`pnpm demo:testnet`). Cadangannya `pnpm demo`: sama persis, tapi di simulasi lokal (anvil) dan tidak butuh internet.

**Sebelum naik panggung** (5 menit sebelumnya):
1. `pnpm demo:testnet` di root repo. Tunggu sampai muncul "Dead Pool demo is up on Monad testnet". Baris pertamanya menampilkan saldo deployer: kalau di bawah **1 MON**, isi dulu dari faucet.monad.xyz ke address deployer.
2. Buka **http://127.0.0.1:3100** (pakai 127.0.0.1, bukan localhost). Klik "Open the demo pool" untuk membuka **tur terpandu**. Untuk demo tanpa tur, hapus `?guide=1` dari URL.
3. **Klik Restart sekali** supaya mulai dari pool baru. Prosesnya sekitar 25 detik, dan tombolnya menghitung "Resetting n/10". Penjurian terbuka 35 detik setelah pool dibuat (**Judge in 0:xx**).

**Di panggung:** Run judge (sekitar 10 detik, "Judging n/8") → klik baris zombie → tutup → tunggu "Challenges close in" habis (20 detik) → Pay survivors ("Paying n/5"). Tidak perlu wallet.

**Bukti on-chain:** kotak **On-chain** di kanan bawah menampilkan setiap transaksi kontrak. Klik untuk membuka semuanya; setiap hash membuka MonadVision. Di drawer tim ada "verdict tx" dan "claim tx". Kalau juri bertanya "ini beneran di chain?", klik salah satu hash.

**Latihan dan demo ulang:** **Restart** (kapan saja) atau **Replay demo** (setelah selesai). Satu putaran penuh memakan gas sekitar 0,3 MON. Stake dan bonus berputar kembali ke deployer, jadi yang benar-benar habis cuma gas. **Selesaikan pool sampai Pay** kalau sempat: pool yang ditinggal di tengah jalan menahan 0,7 MON di kontrak sampai pool itu dijudge dan dibayar.

**Angka:** di testnet stake per tim 0,05 MON dan bonus 0,3 (angka pitch dibagi 1000), jadi survivor dapat +0,12 dan membawa pulang 0,17. Animasi di landing tetap memakai angka pitch (50 → 170) sebagai contoh.

**Yang boleh diklaim dengan jujur:**
- *Blockchain*: kontraknya **live di Monad testnet** (alamat ada di output `pnpm demo:testnet`), dan semua stake, putusan, serta pembayaran adalah transaksi sungguhan dengan test MON. Belum di mainnet, belum diaudit.
- *AI*: tim demo memakai repo contoh, dan putusannya adalah **putusan Claude yang sudah direkam**, supaya demo cepat dan selalu sama. Putusannya tetap ditulis on-chain sungguhan. Mode live (Claude membaca GitHub sungguhan) tinggal satu setting: `JUDGE_ENGINE=claude-cli`.
- *1000 tim*: halaman **/pool/sample** adalah data contoh (ada label "sample data") untuk menunjukkan tampilannya tetap rapi di skala besar.
- *Project kami sendiri*: tombol **Our own bet** membuka pool 90 hari di testnet berisi repo kami.

**Kalau macet:** Ctrl+C lalu `pnpm demo:testnet` lagi. Kalau internet atau RPC testnet bermasalah, pakai `pnpm demo` (lokal, offline). Siapkan juga video rekaman demo sebagai cadangan.

---

## 6. Pertanyaan juri dan jawabannya

**"Kenapa harus di Monad?"**
Pertama, ini masalah Monad sendiri: Monad sudah mengadakan lebih dari 50 Blitz, dan Dead Pool membantu supaya builder dari acara-acara itu tidak hilang. Kedua, biaya transaksi di Monad murah, jadi alasan lengkap AI bisa disimpan di blockchain, tidak cuma ringkasannya. Hakimnya terbuka untuk diperiksa siapa saja.

**"Bukannya sudah ada yang mirip?"**
Ada, namanya ShipLock, di blockchain Solana. Developer mengunci uang jaminan, dan jaminannya dipotong kalau berhenti merilis. Itu bukti developer mau menaruh jaminan. Bedanya, di Dead Pool satu hackathon punya satu pool, uang yang hangus diberikan ke tim yang bertahan, penilainya AI dengan alasan terbuka, dan ada bonus dari sponsor. *(Sebaiknya sebut ShipLock duluan di pitch, sebelum juri yang menyebutnya.)*

**"Apa bedanya dengan DoraHacks atau HackQuest?"**
Mereka mengurus lombanya, satu sampai dua hari. Kami mengurus 90 hari setelahnya, saat kebanyakan project mati. Kami bukan saingan mereka, tapi calon partner.

**"AI-nya bisa diakali, misalnya dengan commit kosong setiap minggu."**
AI membaca **isi perubahan kodenya**, bukan menghitung jumlahnya. Perubahan yang cuma spasi atau titik ditandai zombie. Selain itu, tim lain punya alasan untuk melapor saat masa sanggah, karena setiap zombie yang ketahuan menambah bagian mereka.

**"Kalau ada sanggahan, siapa yang memutuskan?"**
Di versi hackathon ini, penyelenggara pool. Nanti bisa diganti dengan panel atau voting. Untuk demo, sengaja kami buat sederhana dulu.

**"Memangnya ada yang mau menaruh uang?"**
Banyak hackathon Ethereum sudah mewajibkan uang jaminan supaya pesertanya datang, jadi developer sudah terbiasa. Dan tim yang berani bertaruh berarti serius, sehingga sponsor dan investor langsung tahu tim mana yang patut dilirik.

**"TVL-nya kecil."**
Kalau dari hackathon saja, iya, karena hackathon memang tempat uji coba. Pasar sebenarnya adalah grant: kalau penerima grant wajib menaruh jaminan 10%, satu program sebesar 100 juta dolar saja sudah mengunci sekitar 10 juta dolar.

**"Gimana kalau project kalian sendiri mati?"**
Uang kami masuk ke pool, dan itu bukti bahwa Dead Pool bekerja. Jadi kami tetap untung: kalau project-nya hidup, kami dapat bagian; kalau mati, idenya terbukti jalan.

**"Ini judi, kan?"**
Bukan. Di judi, hasilnya ditentukan keberuntungan. Di sini, hasilnya ditentukan oleh **kerja keras tim sendiri**. Ini perjanjian komitmen, sama seperti uang jaminan kehadiran di hackathon.

> Satu hal yang jangan diucapkan: **"kalian semua pernah menaruh jaminan untuk datang ke hackathon."** Monad Blitz gratis dan tidak memakai uang jaminan, jadi kalimat itu salah di ruangan ini.

---
---

## Lampiran (tidak wajib dibaca)

### A. Sumber angka

Buka bagian ini hanya kalau juri bertanya "datanya dari mana?".

| Kalimat di pitch | Sumber |
|---|---|
| Kurang dari 10% project hackathon masih aktif 2 bulan setelah acara | Studi Uiga (2019), Universitas Tartu, dikutip di [Haaga-Helia eSignals](https://esignals.haaga-helia.fi/en/2020/01/14/why-spend-days-to-solve-a-problem-and-create-a-new-idea-in-a-hackathon-and-just-leave-it-there/) |
| (Pendukung) Hanya 21,2% project yang masih punya perubahan kode setelah hackathon | Nolte, Chounta & Herbsleb, CSCW 2020 — [paper](https://par.nsf.gov/servlets/purl/10284449) |
| Monad Blitz lebih dari 50 kali, termasuk Jogja April 2026 | [Monad Blitz Toronto](https://luma.com/MonadBlitzTO), [Monad Blitz Jogja](https://luma.com/blitz-jogja-apr-2026) |
| Arbitrum sekitar $100 juta untuk satu program (STIP), pengguna tidak bertahan | [Gitcoin case study](https://explore.gitcoin.co/case-studies/arbitrum-stip-analysis), [StableLab](https://forum.arbitrum.foundation/t/stablelab-analyzing-stip-s-efficacy-and-ltipp-comparison/24777) |
| Eksperimen rokok di Filipina, peluang berhenti naik lebih dari sepertiga | Giné, Karlan & Zinman, 2010 — [ringkasan J-PAL](https://www.povertyactionlab.org/print/pdf/node/1468), [paper](https://fr.poverty-action.org/sites/default/files/publications/Put_Your_Money_Where_Your_Butt_Is.pdf) |
| Data stickK: 29% berhasil tanpa taruhan, ~80% dengan taruhan + wasit | [Yale Daily News](https://yaledailynews.com/?p=24449), [HarvardX](https://courses.edx.org/c4x/HarvardX/BUS5.1x/asset/8-page.html) |
| Hackathon Ethereum mewajibkan uang jaminan kehadiran | [ETHPrague 2026](https://ducttapeevents.notion.site/ethprague-2026-hacker-manual?pvs=74), [ETHWaterloo](https://unlock-protocol.com/blog/ethwaterloo-tickets) |
| Blok Monad sekitar 0,3 detik | [Monad docs](https://docs.monad.xyz/ai/current-facts.md) |

Kalau juri mendesak, ada dua jawaban cadangan:
- **"Itu cuma tesis, bukan jurnal."** Ada paper akademik pendukung (Nolte, CSCW 2020) dengan kesimpulan serupa: hanya 21,2% project yang masih ada perubahan kode setelah hackathon.
- **"Arbitrum itu insentif aplikasi, bukan hadiah hackathon."** Betul. Contoh itu dipakai untuk menunjukkan polanya: uang datang, lalu orangnya pergi.

### B. Perbandingan dengan ShipLock

| | ShipLock | **Dead Pool** |
|---|---|---|
| Bentuknya | Jaminan per project | Satu pool untuk satu hackathon |
| Uang yang hangus diberikan ke | Dana komunitas, sebagian dimusnahkan | Tim yang bertahan |
| Yang menilai | Komunitas yang ikut menaruh uang | AI yang membaca kode, alasannya terbuka, ada masa sanggah |
| Sponsor | Tidak ada | Ada bonus dari sponsor |

Situs ShipLock: https://www.shiplock.io/

### C. Daftar istilah

- **MON**: mata uang blockchain Monad.
- **Pool**: kumpulan uang taruhan semua tim dalam satu hackathon.
- **TVL**: jumlah uang yang terkunci di sebuah aplikasi crypto.
- **Commit**: satu kali menyimpan perubahan kode di GitHub.
- **Zombie**: project yang punya perubahan kode tapi isinya tidak berarti.
- **Masa sanggah**: waktu singkat setelah putusan, saat siapa pun boleh mengajukan keberatan.
- **Grant**: dana dari ekosistem untuk developer.
- **Arbitrum**: salah satu blockchain besar.
- **ShipLock**: produk yang mirip Dead Pool, di blockchain Solana.
