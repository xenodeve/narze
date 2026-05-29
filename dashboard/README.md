# Bot Dashboard

Discord Music Bot Dashboard สร้างด้วย Next.js 15 + Firebase Firestore

## 🚀 Features

- ✅ Real-time bot status monitoring
- ✅ Live music queue tracking
- ✅ Discord OAuth authentication
- ✅ Role-based access control (User/Owner)
- ✅ Beautiful UI with shadcn/ui
- ✅ Responsive design

## 📋 Prerequisites

- Node.js 18+ หรือ Bun
- Firebase Project
- Discord OAuth Application

## 🛠️ Installation

1. **Clone และติดตั้ง dependencies:**

```bash
cd dashboard
npm install
# หรือ
bun install
```

2. **ตั้งค่า Firebase:**

- สร้าง Firebase Project ที่ [Firebase Console](https://console.firebase.google.com/)
- เปิดใช้งาน Authentication (Discord Provider)
- สร้าง Firestore Database
- คัดลอก Firebase config

3. **ตั้งค่า Environment Variables:**

```bash
cp .env.example .env.local
```

แก้ไขไฟล์ `.env.local` และใส่ค่า Firebase config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. **รัน Development Server:**

```bash
npm run dev
# หรือ
bun dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
dashboard/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Dashboard pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── lib/                   # Utilities
│   ├── firebase.ts       # Firebase config
│   └── utils.ts          # Helper functions
├── types/                 # TypeScript types
│   └── bot.ts            # Bot data types
└── hooks/                 # Custom React hooks
```

## 🔥 Firebase Setup

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bots/{botId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'owner';
    }
    
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'owner';
    }
  }
}
```

## 🎨 Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth
- **State Management:** Zustand
- **Icons:** Lucide React

## 📝 License

MIT
