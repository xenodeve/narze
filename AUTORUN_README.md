# Narze Bot Auto-Restart Scripts

ชุดของ script สำหรับเริ่มต้นและ restart บอท Narze อัตโนมัติเมื่อเกิด error

## ไฟล์ที่มี

### 1. `run.bat` (Original)
- ไฟล์เริ่มต้นปกติ
- เริ่มบอทครั้งเดียว ไม่มี auto-restart

### 2. `autorun.bat` (Basic Auto-Restart)
- Auto-restart เบื้องต้น
- รองรับการ restart เมื่อบอท crash
- แสดง exit code และเวลา restart

### 3. `autorun-advanced.bat` (Advanced Auto-Restart)
- รองรับการจำกัดจำนวน restart สูงสุด (default: 100 ครั้ง)
- แสดง countdown ก่อน restart
- มีตัวเลือกเมื่อบอทหยุดปกติ
- แสดงสถิติการ restart

### 4. `autorun.ps1` (PowerShell Version)
- เวอร์ชัน PowerShell ที่มีฟีเจอร์ครบครัน
- บันทึก log ลงไฟล์ `autorun.log`
- แสดงสถิติ uptime
- จัดการ error ได้ดีกว่า

## วิธีใช้งาน

### สำหรับ Batch Files (.bat)
```cmd
# เรียกใช้ basic version
autorun.bat

# เรียกใช้ advanced version
autorun-advanced.bat
```

### สำหรับ PowerShell (.ps1)
```powershell
# วิธีที่ 1: เรียกใช้แบบปกติ
powershell -ExecutionPolicy Bypass -File autorun.ps1

# วิธีที่ 2: กำหนดค่าเพิ่มเติม
powershell -ExecutionPolicy Bypass -File autorun.ps1 -MaxRestart 50 -RestartDelay 10

# วิธีที่ 3: เปลี่ยน log file
powershell -ExecutionPolicy Bypass -File autorun.ps1 -LogFile "custom.log"
```

## ฟีเจอร์

### Auto-Restart
- ✅ ตรวจจับเมื่อบอท crash
- ✅ Restart อัตโนมัติ
- ✅ แสดง exit code
- ✅ Countdown ก่อน restart

### Safety Features
- ✅ จำกัดจำนวน restart สูงสุด
- ✅ แสดงสถิติการ restart
- ✅ ตัวเลือกเมื่อบอทหยุดปกติ

### Logging (PowerShell only)
- ✅ บันทึก log ลงไฟล์
- ✅ แสดง timestamp
- ✅ ติดตาม uptime

### User Control
- ✅ กด Ctrl+C เพื่อหยุด auto-restart
- ✅ ตัวเลือกเมื่อบอทหยุดปกติ
- ✅ การแสดงผลที่เข้าใจง่าย

## การตั้งค่า

### สำหรับ Batch Files
แก้ไขตัวแปรในไฟล์:
```bat
set max_restart=100          # จำนวน restart สูงสุด
set restart_delay=5          # วินาทีก่อน restart
```

### สำหรับ PowerShell
```powershell
-MaxRestart 100              # จำนวน restart สูงสุด
-RestartDelay 5              # วินาทีก่อน restart  
-LogFile "autorun.log"       # ไฟล์ log
```

## ข้อควรระวัง

1. **Infinite Loop Protection**: สคริปต์มีการจำกัดจำนวน restart เพื่อป้องกัน infinite loop
2. **Manual Stop**: หากต้องการหยุดบอท ให้กด Ctrl+C
3. **Log Files**: PowerShell version จะสร้างไฟล์ log ในโฟลเดอร์เดียวกัน
4. **Exit Codes**: 
   - `0` = หยุดปกติ
   - `≠0` = เกิด error

## ตัวอย่างการใช้งาน

### สำหรับ Development
```cmd
autorun.bat
```

### สำหรับ Production
```cmd
autorun-advanced.bat
```

### สำหรับ Server
```powershell
powershell -ExecutionPolicy Bypass -File autorun.ps1 -MaxRestart 1000 -LogFile "production.log"
```

## การ Debug

1. ดู exit code ที่แสดงใน console
2. ตรวจสอบไฟล์ log (สำหรับ PowerShell version)
3. นับจำนวน restart count
4. ดู timestamp เพื่อหาสาเหตุการ crash

## คำแนะนำ

- สำหรับการใช้งานปกติ: ใช้ `autorun.bat`
- สำหรับการใช้งานระยะยาว: ใช้ `autorun-advanced.bat`
- สำหรับ server/production: ใช้ `autorun.ps1`
