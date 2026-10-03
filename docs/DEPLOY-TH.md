# คู่มือติดตั้ง PetkubGrader (แบบ B: คอมของตัวเอง + โดเมน + Cloudflare Tunnel)

คู่มือนี้พาติดตั้ง grader บนคอมพิวเตอร์ของคุณหรือของโรงเรียน แล้วเปิดให้นักเรียนเข้าจากที่ไหนก็ได้ทาง
`https://grader.โดเมนของคุณ` โดย **ไม่ต้องมี IP สาธารณะ และไม่ต้องตั้งค่า router**

```
นักเรียน ──https──► Cloudflare ──(tunnel)──► คอมของคุณ: cloudflared → Caddy → Next.js → FastAPI → Judge0
```

**ค่าใช้จ่าย:** ค่าโดเมนประมาณ 350–500 บาท/ปี ส่วนอื่นฟรีทั้งหมด (Cloudflare, Google login, ซอฟต์แวร์)

---

## 0. สิ่งที่ต้องเตรียม

| อย่าง | รายละเอียด |
|---|---|
| คอมพิวเตอร์ | RAM 8 GB ขึ้นไป, CPU 4 core ขึ้นไป, ดิสก์ว่าง 30 GB ขึ้นไป |
| ระบบปฏิบัติการ | **Ubuntu 22.04 / 24.04** (แนะนำ) หรือ Windows 10/11 ที่ใช้ WSL2 (ดูหัวข้อ 11) |
| อินเทอร์เน็ต | เน็ตบ้านหรือเน็ตโรงเรียนธรรมดาก็ใช้ได้ |
| บัญชี | Google (สำหรับสร้าง OAuth) และ Cloudflare (สมัครฟรี) |

> เครื่องต้อง **เปิดไว้ตลอดช่วงที่ให้นักเรียนใช้งาน** และควรปิดโหมด Sleep/Hibernate

---

## 1. ซื้อโดเมนและนำเข้า Cloudflare

1. สมัคร Cloudflare ที่ <https://dash.cloudflare.com/sign-up>
2. ซื้อโดเมน มี 2 ทาง:
   - **ง่ายที่สุด:** ซื้อผ่าน Cloudflare เลย (เมนู *Domain Registration → Register Domains*) ราคาเท่าทุน และนำเข้า Cloudflare ให้อัตโนมัติ
   - หรือซื้อที่อื่น (Namecheap, Porkbun ฯลฯ) แล้วไปที่ Cloudflare → *Add a domain* → เลือกแพ็กเกจ **Free** → นำ **nameserver** 2 ตัวที่ Cloudflare ให้ ไปใส่แทน nameserver เดิมในเว็บที่ซื้อโดเมน (อาจใช้เวลาตั้งแต่ไม่กี่นาทีจนถึง 24 ชั่วโมง)

ในคู่มือนี้จะใช้ตัวอย่างว่า **`grader.example.com`** ให้เปลี่ยนเป็นโดเมนของคุณทุกจุด

---

## 2. ติดตั้ง Docker และ Git (Ubuntu)

```bash
sudo apt update && sudo apt install -y git make curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # ใช้ docker ได้โดยไม่ต้องพิมพ์ sudo
sudo systemctl enable docker       # ให้ docker เริ่มเองตอนเปิดเครื่อง
```

จากนั้น **ออกจากระบบแล้วล็อกอินใหม่** (หรือรีสตาร์ตเครื่อง) แล้วทดสอบด้วย `docker run --rm hello-world`

---

## 3. ดาวน์โหลดโค้ดและสร้างไฟล์ `.env`

```bash
git clone https://github.com/petkub/PetkubGrader.git
cd PetkubGrader
cp .env.example .env

# สุ่มรหัสลับทั้งหมดให้อัตโนมัติ (รันครั้งเดียว)
sed -i "s|change_me_strong_password|$(openssl rand -hex 16)|g; \
        s|change_me_internal_shared_secret|$(openssl rand -hex 32)|; \
        s|change_me_judge0_token|$(openssl rand -hex 32)|; \
        s|change_me_auth_secret_base64|$(openssl rand -base64 32)|" .env
```

จากนั้นเปิดไฟล์ด้วย `nano .env` แล้วแก้บรรทัดนี้ให้เป็นโดเมนของคุณ:

```ini
AUTH_URL=https://grader.example.com
```

> ⚠️ ห้ามแชร์ไฟล์ `.env` ให้ใคร และห้ามตั้ง `ENABLE_DEV_LOGIN=true` บนเครื่องจริงเด็ดขาด

---

## 4. สร้าง Google Login (OAuth)

1. ไปที่ <https://console.cloud.google.com/> → สร้างโปรเจกต์ใหม่ เช่น `petkub-grader`
2. เมนู **APIs & Services → OAuth consent screen** (บางครั้งเรียกว่า *Google Auth Platform*)
   - User type: **External**
   - ใส่ชื่อแอป อีเมลของคุณ และในส่วน *Authorized domains* ใส่ `example.com`
   - เมื่อตั้งค่าเสร็จ ให้กด **Publish app** (เปลี่ยนจาก *Testing* เป็น *In production*) ถ้ายังเป็น Testing จะล็อกอินได้เฉพาะอีเมลที่ใส่ไว้ใน Test users เท่านั้น
     ระบบขอข้อมูลแค่อีเมล/ชื่อ/รูป จึงไม่ต้องให้ Google ตรวจสอบแอป
3. เมนู **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://grader.example.com`
   - Authorized redirect URIs: `https://grader.example.com/api/auth/callback/google`
4. คัดลอก **Client ID** และ **Client secret** มาใส่ใน `.env`:

```ini
AUTH_GOOGLE_ID=xxxxxxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxxxxxxx
```

> GitHub login และ magic link ทางอีเมลไม่บังคับ ถ้าเว้นค่าใน `.env` ไว้ ปุ่มของวิธีนั้นจะไม่แสดงในหน้าล็อกอิน

---

## 5. สร้าง Cloudflare Tunnel

1. ที่ Cloudflare Dashboard เข้าเมนู **Zero Trust** (ครั้งแรกระบบจะให้ตั้งชื่อทีมและเลือกแพ็กเกจ **Free**)
2. ไปที่ **Networks → Tunnels → Create a tunnel** → เลือก **Cloudflared** → ตั้งชื่อ เช่น `grader`
3. ในหน้า *Install connector* จะเห็นคำสั่งที่มี `--token eyJhIjoi...` ให้ **คัดลอกเฉพาะส่วน token** (ข้อความยาวๆ หลัง `--token`)
   ไม่ต้องรันคำสั่งที่ Cloudflare แนะนำ เพราะระบบนี้มี cloudflared อยู่ใน docker แล้ว
4. กด Next ไปหน้า **Public Hostname** แล้วตั้งค่า:
   - Subdomain: `grader`  Domain: `example.com`
   - Service Type: **HTTP**  URL: **`caddy:80`**
5. ใส่ค่าใน `.env` (ลบเครื่องหมาย `#` หน้าสองบรรทัดนี้ออก):

```ini
COMPOSE_PROFILES=tunnel
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

> ชื่อเมนูของ Cloudflare อาจเปลี่ยนไปบ้าง แต่ขั้นตอนหลักเหมือนเดิม: สร้าง tunnel → เอา token → ชี้ hostname ไปที่ `caddy:80`

---

## 6. เปิดระบบ

```bash
make build       # ครั้งแรกใช้เวลาประมาณ 5–15 นาที
make up
make setup-db    # สร้างตารางในฐานข้อมูล (ทำครั้งเดียวตอนติดตั้ง)
make ps          # ทุกบรรทัดควรขึ้น "Up"
```

ทดสอบด้วยการเปิด `https://grader.example.com` ในเบราว์เซอร์ ถ้าเห็นหน้าเว็บแปลว่าสำเร็จ 🎉

---

## 7. ตั้งตัวเองเป็นแอดมิน

1. เข้าเว็บแล้วกด **Continue with Google** ด้วยบัญชีของคุณ (ตอนนี้สถานะจะเป็น *pending*)
2. ที่เครื่องเซิร์ฟเวอร์รัน:

```bash
make shell-db
```

แล้วพิมพ์ (เปลี่ยนเป็นอีเมลของคุณ):

```sql
UPDATE users SET role='admin', status='approved' WHERE email='you@gmail.com';
\q
```

3. รีเฟรชหน้าเว็บ ระบบจะให้ตั้ง **username** หลังจากนั้นจะเห็นเมนูของแอดมิน

---

## 8. ให้นักเรียนเข้าใช้งาน

1. แจกลิงก์ `https://grader.example.com` ให้นักเรียนล็อกอินด้วย Google
2. ไปที่ **`/admin/users`** แล้วกด **Approve** ทีละคน (ก่อนอนุมัติ นักเรียนดูโจทย์ได้แต่ส่งโค้ดไม่ได้)
3. ถ้ามีครูคนอื่นที่ต้องสร้างโจทย์ด้วย ให้เปลี่ยน Role ของครูคนนั้นเป็น **setter**

---

## 9. สร้างโจทย์

ใน repo มีโจทย์ตัวอย่างอยู่ที่ [`examples/aplusb/`](../examples/aplusb/) ใช้เป็นแบบได้เลย

### 9.1 เตรียมไฟล์ ZIP

```
config.yaml      ← ต้องอยู่ชั้นนอกสุดของ zip
tests/
  1.in  1.out
  2.in  2.out
  ...
```

ตัวอย่าง `config.yaml`:

```yaml
time_ms: 1000              # เวลาสำหรับ C++ (Python ได้ 3 เท่า)
memory_mb: 256
scoring_mode: ioi_strict   # ioi_strict = ได้คะแนน subtask เมื่อผ่านทุกเคส | partial = ได้ตามสัดส่วนเคสที่ผ่าน
samples:                   # ตัวอย่างที่แสดงในหน้าโจทย์ (ไม่มีคะแนน)
  - in: "1 2\n"
    out: "3\n"
    explanation: "1 + 2 = 3"
subtasks:                  # weight ทุกตัวรวมกันต้องได้ 100
  - name: "small"
    weight: 40
    tests: [1, 2]
  - name: "big numbers"
    weight: 60
    tests: [3]
```

บีบอัดไฟล์:

```bash
cd examples/aplusb
zip -r ../aplusb.zip config.yaml tests
```

(บน Windows: เลือก `config.yaml` กับโฟลเดอร์ `tests` → คลิกขวา → *Compress to ZIP*
อย่าบีบอัดทั้งโฟลเดอร์ `aplusb` เพราะ `config.yaml` จะไม่อยู่ชั้นนอกสุดของ zip)

### 9.2 อัปโหลดผ่านเว็บ

1. ไปที่ **`/manage`** → **New problem** → ใส่ Slug (เช่น `a-plus-b`) และชื่อโจทย์
2. ในหน้าแก้ไขโจทย์ ใส่ Statement (เขียนด้วย Markdown ใส่สูตรแบบ `$a+b$` ได้) → บันทึก
3. อัปโหลดไฟล์ ZIP ในส่วน testcases (ถ้าอัปโหลดใหม่ ระบบจะลบ testcase เดิมทั้งหมดแล้วใช้ชุดใหม่แทน)
4. กด **Publish** โจทย์จะปรากฏให้นักเรียนเห็น
5. **ส่งโค้ดเฉลยทดสอบเองก่อน** ([`solution.cpp`](../examples/aplusb/solution.cpp) / [`solution.py`](../examples/aplusb/solution.py)) ต้องได้ 100 คะแนน

### 9.3 จัดการแข่งขัน (contest)

ไปที่ **`/manage/contests`** → สร้าง contest → เพิ่มโจทย์ → Publish
นักเรียนสมัครเข้าแข่งที่ **`/contests`** และดูอันดับได้ที่ `/contests/<ชื่อ>/scoreboard`

---

## 10. การดูแลประจำวัน

| ต้องการ | คำสั่ง |
|---|---|
| ดูสถานะ | `make ps` |
| ดู log (กด Ctrl+C เพื่อออก) | `make logs` |
| ปิดระบบ | `make down` (ข้อมูลไม่หาย) |
| เปิดระบบ | `make up` |
| สำรองข้อมูล | `make backup` → ได้ไฟล์ในโฟลเดอร์ `backups/` |
| อัปเดตเวอร์ชันใหม่ | `git pull && make build && make up && make migrate` |

**เปิดเครื่องใหม่:** ระบบจะเริ่มทำงานเองเพราะตั้ง `restart: unless-stopped` ไว้ และ docker ถูก enable ไว้ในขั้นตอนที่ 2

**สำรองข้อมูลอัตโนมัติทุกคืนตอนตี 3:** รัน `crontab -e` แล้วเพิ่มบรรทัด

```
0 3 * * * cd /home/<ชื่อผู้ใช้>/PetkubGrader && make backup >/dev/null 2>&1
```

แล้วคัดลอกโฟลเดอร์ `backups/` ไปเก็บไว้ที่อื่นเป็นครั้งคราว (Google Drive หรือ USB) เผื่อฮาร์ดดิสก์เสีย

**กู้คืนข้อมูล หรือย้ายไปเครื่องใหม่/VPS:** ติดตั้งตามขั้นตอนที่ 2–6 บนเครื่องใหม่ คัดลอกโฟลเดอร์ `backups/` ไปไว้ แล้วรัน
(เปลี่ยน `XXXX` เป็นวันที่ของไฟล์):

```bash
make restore DB=backups/db-XXXX.sql.gz TC=backups/testcases-XXXX.tar.gz
docker compose restart fastapi
```

> ข้อมูลในฐานข้อมูลตอนนี้จะถูก**แทนที่ทั้งหมด**ด้วยข้อมูลจาก backup

---

## 11. ใช้บน Windows (WSL2)

1. เปิด PowerShell แบบ Administrator แล้วรัน `wsl --install -d Ubuntu` จากนั้นรีสตาร์ตเครื่อง
2. เปิดแอป **Ubuntu** แล้วทำขั้นตอนที่ 2–7 ข้างในนั้นได้เลย
   (เก็บโค้ดไว้ใน home ของ Ubuntu เช่น `~/PetkubGrader` อย่าเก็บใน `/mnt/c/...` เพราะจะช้ามาก)
3. WSL จะปิดตัวเองเมื่อไม่มีหน้าต่าง Ubuntu เปิดอยู่ ให้เปิดหน้าต่าง Ubuntu ทิ้งไว้ตลอด
   หรือใช้ Docker Desktop และเปิดตัวเลือก *Start Docker Desktop when you sign in*

> ถ้าเลือกได้ Ubuntu ที่ติดตั้งลงเครื่องโดยตรงจะเสถียรกว่า

---

## 12. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| เปิดเว็บแล้วขึ้น Cloudflare error 1033 / 502 | tunnel ยังไม่ทำงาน → `docker compose logs cloudflared` ตรวจ token ใน `.env` และตรวจว่าตั้ง `COMPOSE_PROFILES=tunnel` แล้ว |
| กด Google แล้วขึ้น `redirect_uri_mismatch` | Redirect URI ใน Google Console ต้องตรงกับ `https://<โดเมน>/api/auth/callback/google` ทุกตัวอักษร |
| ล็อกอินแล้วเด้งกลับหน้า sign-in | `AUTH_URL` ใน `.env` ต้องตรงกับโดเมนที่เปิดอยู่ (ขึ้นต้นด้วย `https://`) แก้แล้วรัน `docker compose up -d nextjs` |
| นักเรียนกดส่งโค้ดไม่ได้ | ยังไม่ได้ Approve → `/admin/users` |
| กดปุ่มแล้วไม่มีอะไรเกิดขึ้น (หลังอัปเดต) | ให้นักเรียนกด Ctrl+Shift+R เพื่อรีเฟรชหน้าเว็บแบบเต็ม |
| ผลตรวจค้างที่ `queued` / `judging` | `docker compose logs judge0-workers fastapi` ดู error แล้วลอง `docker compose restart judge0-workers` |
| ทุกเคสขึ้น `Failed to create control group` | ระบบตั้งค่ารองรับเรื่องนี้ไว้แล้ว ถ้ายังเจออยู่ให้ส่ง log ให้ผู้ดูแลโค้ด |
| แก้ `.env` แล้วไม่มีผล | ต้องรัน `make up` ใหม่เพื่อให้ container โหลดค่าใหม่ |

---

## 13. รองรับนักเรียน 100 คนได้ไหม

ได้สบาย ระบบนี้ตรวจโค้ดทีละ testcase แต่ละเคสใช้เวลาเสี้ยววินาที และตั้งค่าเริ่มต้นให้นักเรียน 1 คนส่งได้ไม่เกิน 1 ครั้งต่อ 10 วินาที
(`SUBMISSION_RATE_LIMIT_PER_10S` ใน `.env`) คอม 4 core ตรวจโค้ดช่วงแข่งของนักเรียน 100 คนได้โดยไม่มีปัญหา
ถ้าช่วงแข่งเห็นผลตรวจขึ้น queued นาน ค่อยพิจารณาเพิ่ม CPU
