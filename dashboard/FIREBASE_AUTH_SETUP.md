# การตั้งค่า Firebase Authentication

## วิธีที่ 1: ใช้ Google (แนะนำสำหรับทดสอบ) ⭐

### ขั้นตอน:
1. ไปที่ [Firebase Console](https://console.firebase.google.com/)
2. เลือก Project ของคุณ
3. ไปที่ **Authentication** → **Sign-in method**
4. คลิก **Google**
5. เปิดใช้งาน (Enable)
6. กด **Save**

✅ **เสร็จแล้ว!** ทดสอบ login ได้เลย

---

## วิธีที่ 2: ใช้ Discord OAuth (สำหรับ Production)

### ขั้นตอนที่ 1: สร้าง Discord Application

1. ไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. คลิก **New Application**
3. ตั้งชื่อ (เช่น "Bot Dashboard")
4. ไปที่ **OAuth2** → **General**
5. คัดลอก **Client ID** และ **Client Secret**
6. ใน **Redirects** เพิ่ม:
   ```
   https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler
   ```
   (แทน `YOUR_PROJECT_ID` ด้วย Firebase Project ID ของคุณ)

### ขั้นตอนที่ 2: ตั้งค่าใน Firebase

1. ไปที่ Firebase Console → **Authentication** → **Sign-in method**
2. เลือก **Add new provider**
3. เลือก **OpenID Connect**
4. กรอกข้อมูล:
   - **Name**: Discord
   - **Client ID**: (จาก Discord)
   - **Client Secret**: (จาก Discord)
   - **Issuer**: `https://discord.com`
5. กด **Save**

### ขั้นตอนที่ 3: อัปเดตโค้ด

แก้ไขไฟล์ `hooks/useAuth.tsx`:

```typescript
const signInWithDiscord = async () => {
  const provider = new OAuthProvider('oidc.discord');
  provider.addScope('identify');
  provider.addScope('email');
  
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};
```

---

## วิธีที่ 3: ใช้ Email/Password (Development)

1. Firebase Console → **Authentication** → **Sign-in method**
2. เปิดใช้งาน **Email/Password**
3. สร้าง user ทดสอบใน **Authentication** → **Users** → **Add user**

---

## คำแนะนำ

**สำหรับตอนนี้:**
- ใช้ **Google** เพื่อทดสอบก่อน (ง่ายที่สุด)
- ระบบ Authentication ทำงานได้แล้ว
- เปลี่ยนเป็น Discord ทีหลังก็ได้

**สำหรับ Production:**
- ใช้ **Discord OAuth** เพื่อให้ตรงกับ theme
- ต้องตั้งค่าใน Discord Developer Portal
