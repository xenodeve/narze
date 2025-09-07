# Terminal Silent Mode

เมื่อใช้คำสั่งผ่าน Terminal Commands บอทจะไม่ส่ง embed หรือข้อความใดๆ ไปยัง text channel ในเซิร์ฟเวอร์ Discord เพื่อไม่ให้รบกวนผู้ใช้

## 🔇 การทำงานของ Silent Mode

### ✅ **สิ่งที่ไม่ถูกส่ง:**
- ❌ Embed แสดงเพลงที่กำลังเล่น
- ❌ ข้อความแจ้งเตือนต่างๆ
- ❌ Embed ข้อมูล playlist
- ❌ ข้อความแสดงสถานะ

### 📟 **สิ่งที่แสดงใน Terminal:**
- ✅ ข้อความยืนยันการเล่นเพลง
- ✅ Log การเริ่ม/จบเพลง
- ✅ สถานะ player
- ✅ ข้อผิดพลาด (ถ้ามี)

## 🎯 ตัวอย่างการทำงาน

### **คำสั่ง Terminal:**
```bash
Bot Terminal > play "Imagine Dragons Bones" "My Server" "General"
```

### **ผลลัพธ์ใน Terminal:**
```
[TERMINAL] Processing play command...
[TERMINAL] Query: Imagine Dragons Bones
[TERMINAL] Guild: My Server (123456789012345678)
[TERMINAL] Voice Channel: General (987654321098765432)
[TERMINAL] Text Channel: general (765432109876543210)
[TERMINAL SUCCESS] Added track: Imagine Dragons - Bones
[TERMINAL] Artist: Imagine Dragons
[TERMINAL] Duration: 02:46
[TERMINAL TRACK] Now playing: Imagine Dragons - Bones in My Server
```

### **ผลลัพธ์ใน Discord:**
```
(ไม่มีข้อความใดๆ ส่งไปใน text channel)
```

## 🔧 การทำงานภายใน

### **Flag System:**
```typescript
// เมื่อใช้คำสั่งจาก terminal
(player as any).set('isTerminalCommand', true);

// ตรวจสอบใน events
const isTerminalCommand = (player as any).get('isTerminalCommand') || false;
if (isTerminalCommand) {
    // แสดงใน terminal แทนส่ง embed
    console.log(`[TERMINAL TRACK] Now playing: ${track.info.title}`);
    return;
}
```

### **Events ที่ได้รับการปรับแก้:**

1. **`trackStart.ts`**
   - ไม่ส่ง embed "Now Playing"
   - แสดง log ใน terminal แทน

2. **`trackEnd.ts`**
   - ไม่ส่งข้อความแจ้งเตือน
   - แสดง log ใน terminal

3. **`queueEnd.ts`**
   - ไม่ส่งข้อความแจ้งคิวหมด
   - แสดง log ใน terminal

4. **`playerDisconnect.ts`**
   - แสดง log แยกสำหรับ terminal commands
   - Reset flag เมื่อ player ถูกทำลาย

## 🎭 ข้อดีของ Silent Mode

### **สำหรับผู้ดูแลระบบ:**
- 🔧 ทดสอบบอทโดยไม่รบกวนผู้ใช้
- 🎛️ ควบคุมเพลงจากระยะไกล
- 📊 ตรวจสอบสถานะระบบ
- 🚀 จัดการหลายเซิร์ฟเวอร์พร้อมกัน

### **สำหรับผู้ใช้ในเซิร์ฟเวอร์:**
- 🔕 ไม่ถูกรบกวนด้วยข้อความ
- 🎵 ได้ฟังเพลงโดยไม่มี spam
- 🧹 chat ที่สะอาดไม่มี embed มากเกินไป

## ⚠️ ข้อควรระวัง

1. **ไม่มีการแจ้งเตือน:** ผู้ใช้ในเซิร์ฟเวอร์จะไม่ทราบว่ามีการเปลี่ยนแปลงเพลง
2. **ต้องตรวจสอบ Terminal:** ข้อผิดพลาดจะแสดงใน terminal เท่านั้น
3. **Player State:** ผู้ใช้อาจสับสนเมื่อเพลงเปลี่ยนโดยไม่มีการแจ้งเตือน

## 🎯 การใช้งานที่แนะนำ

### **เหมาะสำหรับ:**
- ✅ การทดสอบระบบ
- ✅ การจัดการแบบ background
- ✅ การเล่นเพลง ambient/background music
- ✅ การจัดการระบบออโต

### **ไม่เหมาะสำหรับ:**
- ❌ การใช้งานแบบ interactive กับผู้ใช้
- ❌ เซิร์ฟเวอร์ที่ต้องการ transparency
- ❌ การเล่นเพลงที่ต้องการ feedback

## 🔄 การสลับระหว่าง Mode

### **Terminal Mode (Silent):**
```bash
Bot Terminal > play "song" "server" "voice channel"
# ไม่มี embed ใน Discord
```

### **Discord Mode (Normal):**
```
/play query:song
# มี embed แสดงเพลงปกติ
```

## 📚 Related Documentation
- [Terminal Commands Guide](./terminal-commands.md)
- [Player Events](./commands/)
- [Configuration Guide](./config-guide.md)
