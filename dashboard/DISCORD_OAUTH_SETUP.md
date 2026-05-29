# 🔐 Discord OAuth2 Setup Guide

## ขั้นตอนการตั้งค่า Discord OAuth2

### 1️⃣ สร้าง Discord Application

1. ไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. คลิก "New Application"
3. ตั้งชื่อ Application (เช่น "Narze Bot Dashboard")
4. ยอมรับ Terms of Service และ คลิก "Create"

### 2️⃣ ตั้งค่า OAuth2

1. ไปที่ "OAuth2" → "General"
2. **Copy Client ID** - บันทึกไว้
3. คลิก "Reset Secret"
4. **Copy Client Secret** - บันทึกไว้อย่างปลอดภัย

### 3️⃣ เพิ่ม Redirect URI

1. ไปที่ "OAuth2" → "General"
2. เลื่อนลงมาหา "Redirects"
3. คลิก "Add Redirect"
4. เพิ่ม URL:
   - **Development**: `http://localhost:3000/api/auth/discord/callback`
   - **Production**: `https://your-domain.com/api/auth/discord/callback`

### 4️⃣ ตั้งค่าสิทธิการเข้าถึง (Scopes & Permissions)

1. ไปที่ "OAuth2" → "General"
2. เลื่อนหา "Scopes"
3. เลือก:
   - ✅ `identify`
   - ✅ `email`
   - ✅ `guilds`

### 5️⃣ ตั้งค่าตัวแปรสิ่งแวดล้อม

ในไฟล์ `.env.local`:

```env
# Discord OAuth2
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
DISCORD_CLIENT_SECRET=your_client_secret_here

# Firebase (ยังคงใช้สำหรับ Firestore)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 6️⃣ ทดสอบ Discord OAuth

1. รันสคริป: `npm run dev`
2. ไปที่ `http://localhost:3000/login`
3. คลิก "เข้าสู่ระบบด้วย Discord"
4. คุณควรจะเห็น Discord authorization page

---

## 🔧 Firestore Custom Claims (สำหรับ Admin Users)

หากต้องการให้บางคนเป็น admin:

1. ไปที่ Firebase Console
2. ไปที่ "Authentication" → "Users"
3. เลือก user ที่ต้องการให้เป็น admin
4. คลิก "Custom Claims" 
5. เพิ่ม:
   ```json
   {
     "admin": true,
     "role": "admin"
   }
   ```

---

## 🛡️ ความปลอดภัย

⚠️ **ข้อควรระวัง:**

- ❌ ไม่ต้องเปิดเผย `DISCORD_CLIENT_SECRET` บน GitHub
- ✅ ใช้ `.env.local` สำหรับค่าที่เป็นความลับ
- ✅ เพิ่ม `.env.local` ใน `.gitignore`
- ✅ ตรวจสอบ Redirect URI อย่างเคร่งครัด

---

## 🧪 Testing

### Test Discord Login

```bash
# ตรวจสอบ environment variables
echo $NEXT_PUBLIC_DISCORD_CLIENT_ID
echo $DISCORD_CLIENT_SECRET

# รันสคริปพัฒนา
npm run dev

# เปิด http://localhost:3000/login
# ลองเข้าสู่ระบบด้วย Discord
```

### ตรวจสอบใน Console

เมื่อเข้าสู่ระบบสำเร็จ คุณควรเห็น:

```javascript
// ใน browser console
console.log('✅ Discord login successful');
// ข้อมูล user ควรถูกบันทึกใน Firestore
```

---

## 🐛 Troubleshooting

### ❌ "Authorization code not provided"

- ตรวจสอบ Redirect URI ตรงกับในการตั้งค่า
- ล้างเบราว์เซอร์ cache

### ❌ "Failed to fetch Discord user"

- ตรวจสอบ Client Secret ถูกต้อง
- ตรวจสอบการตั้งค่า Scopes

### ❌ "Discord OAuth ยังไม่ได้ตั้งค่า"

- ตรวจสอบ `NEXT_PUBLIC_DISCORD_CLIENT_ID` มีค่า
- ตรวจสอบ `.env.local` ถูกต้อง

---

## 📚 ที่มาข้อมูล

- [Discord Developer Docs](https://discord.com/developers/docs)
- [OAuth2 Documentation](https://discord.com/developers/docs/topics/oauth2)
- [Scopes Documentation](https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes)
