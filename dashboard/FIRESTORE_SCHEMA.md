# 🗄️ Firestore Schema Documentation

## Collections Structure

### 1️⃣ `users` Collection

เก็บข้อมูล user และ preferences

```typescript
{
  id: string;                          // discord_{discordId}
  discordId: string;                   // Discord User ID
  username: string;                    // Discord Username
  discriminator: string;               // Discord Discriminator (#0000)
  email: string;                       // Discord Email
  avatar: string | null;               // Avatar Hash
  verified: boolean;                   // Email Verified
  accessToken: string;                 // Discord OAuth Access Token
  refreshToken: string;                // Discord OAuth Refresh Token
  tokenExpiresAt: number;              // Token Expiration Timestamp
  
  // Guild/Server ที่ user เป็นสมาชิก
  guilds: Array<{
    id: string;                        // Guild ID
    name: string;                      // Guild Name
    icon: string | null;               // Guild Icon Hash
    owner: boolean;                    // User is Owner
  }>;
  
  // Settings
  preferences: {
    language: 'th' | 'en';            // ภาษา
    theme: 'light' | 'dark' | 'auto'; // โหมดสีหน้าจอ
    notificationsEnabled: boolean;     // เปิด/ปิดการแจ้งเตือน
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2️⃣ `guilds` Collection

เก็บข้อมูล Guild/Server

```typescript
{
  id: string;                          // Guild ID (เป็น Document ID)
  name: string;                        // Guild Name
  icon: string | null;                 // Guild Icon Hash
  ownerId: string;                     // Owner User ID
  
  // Music Settings
  musicConfig: {
    musicChannelId: string;            // Text Channel สำหรับควบคุมเพลง
    autoPlayEnabled: boolean;          // เล่นเพลงต่อไปเมื่อ queue ว่าง
    defaultVolume: number;             // ระดับเสียงเริ่มต้น (0-100)
    prefix: string;                    // Command Prefix (ถ้ามี)
  };
  
  // Bot Status
  botStatus: {
    connected: boolean;                // Bot เชื่อมต่อ
    playerActive: boolean;             // มี Active Player
    lastSeen: Timestamp;               // เวลาครั้งสุดท้ายที่ online
  };
  
  // Members with Permissions
  members: Array<{
    userId: string;
    roles: string[];                   // Discord Roles
    canPlayMusic: boolean;
    canManageQueue: boolean;
    canEditSettings: boolean;
  }>;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 3️⃣ `playHistory` Collection

เก็บประวัติการเล่นเพลง

**โครงสร้าง**: `/playHistory/{guildId}/userHistory/{userId}/tracks/{trackId}`

```typescript
{
  id: string;                          // Track ID (Lavalink Track)
  title: string;                       // ชื่อเพลง
  artist: string;                      // ศิลปิน
  duration: number;                    // ความยาว (milliseconds)
  url: string;                         // URL เพลง
  thumbnail: string;                   // Thumbnail URL
  source: 'youtube' | 'spotify' | 'soundcloud' | 'http'; // แหล่งที่มา
  
  // Play Statistics
  playCount: number;                   // จำนวนครั้งที่เล่น
  totalPlayTime: number;               // รวมเวลาที่เล่น (milliseconds)
  lastPlayedAt: Timestamp;
  
  // Timestamps
  addedAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Collection Path Examples**:
- `/playHistory/guildId123/userHistory/userId456/tracks/trackId789` - Per User History ใน Guild นั้นๆ
- `/playHistory/guildId123/guildHistory/topTracks/trackId789` - Top Tracks ของ Guild

---

### 4️⃣ `favorites` Collection

เก็บเพลงที่เพื่อ (Library)

**โครงสร้าง**: `/favorites/{userId}/tracks/{trackId}` และ `/favorites/{guildId}/topTracks/{trackId}`

```typescript
{
  id: string;                          // Track ID
  title: string;                       // ชื่อเพลง
  artist: string;                      // ศิลปิน
  duration: number;                    // ความยาว
  url: string;                         // URL
  thumbnail: string;                   // Thumbnail
  source: 'youtube' | 'spotify' | 'soundcloud' | 'http';
  
  // Favorite Info
  savedAt: Timestamp;
  genre: string;                       // ประเภทเพลง (ถ้ามี)
  notes: string;                       // บันทึกของ user
  
  // Guild-Specific
  guilds: Array<{
    guildId: string;
    playCount: number;
    lastPlayedAt: Timestamp;
  }>;
}
```

---

### 5️⃣ `guildConfig` Collection

เก็บการตั้งค่า Guild เพิ่มเติม

```typescript
{
  id: string;                          // Guild ID
  
  // Music Channel Configuration
  musicChannels: Array<{
    channelId: string;                 // Discord Text Channel ID
    name: string;                      // Channel Name
    isPrimary: boolean;                // Primary Music Channel
    allowDjRole: string | null;        // DJ Role ID
    autoRemoveMessages: boolean;       // ลบข้อความอื่นใน channel นี้
  }>;
  
  // Access Control
  permissions: {
    requireRoleToPlay: boolean;
    djRoleId: string | null;
    allowedRoles: string[];            // Roles ที่สามารถใช้คำสั่ง
  };
  
  // Announcements
  announcements: {
    enableNowPlaying: boolean;         // ส่งข้อมูลเพลงปัจจุบัน
    enableTrackEnd: boolean;           // แจ้งเวลาเพลงจบ
    channelId: string | null;          // Channel สำหรับประกาศ
  };
  
  // Statistics
  stats: {
    totalTracksPlayed: number;
    totalPlayTime: number;             // รวมเวลาที่เล่น
    uniqueArtists: number;
    uniqueTracks: number;
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 🔐 Security Rules

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users - อ่านเฉพาะตัวเอง อัปเดตเฉพาะตัวเอง
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow create: if request.auth.uid != null;
      allow update: if request.auth.uid == userId;
      allow delete: if false;
    }
    
    // Guilds - อ่านเฉพาะสมาชิก อัปเดตเฉพาะ Owner
    match /guilds/{guildId} {
      allow read: if request.auth.uid != null;
      allow create: if request.auth.uid != null;
      allow update: if get(/databases/$(database)/documents/guilds/$(guildId)).data.ownerId == request.auth.uid;
      allow delete: if get(/databases/$(database)/documents/guilds/$(guildId)).data.ownerId == request.auth.uid;
    }
    
    // Play History - อ่านเฉพาะสมาชิก Guild นั้น
    match /playHistory/{guildId}/userHistory/{userId}/tracks/{trackId} {
      allow read: if request.auth.uid != null;
      allow write: if request.auth.uid == userId;
    }
    
    // Favorites - อ่านเฉพาะเจ้าของ
    match /favorites/{userId}/tracks/{trackId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    
    // Guild Config
    match /guildConfig/{guildId} {
      allow read: if request.auth.uid != null;
      allow write: if get(/databases/$(database)/documents/guilds/$(guildId)).data.ownerId == request.auth.uid;
    }
  }
}
```

---

## 📊 Indexes ที่ต้องสร้าง

### Collections สำหรับ Query ที่ซับซ้อน:

1. **playHistory** - Query ตาม `playCount` DESC สำหรับ Top Tracks
2. **favorites** - Query ตาม `savedAt` DESC สำหรับ Recent Favorites
3. **playHistory** - Query ตาม `lastPlayedAt` DESC สำหรับ Recently Played

---

## 🔄 Data Sync Flow

```
Bot (Discord.js)
    ↓
Firestore (realtime updates)
    ↓
Dashboard (WebSocket/HTTP)
    ↓
User (Browser)
```

### Sync Triggers:

1. **Track Played** → Update `playHistory`
2. **Queue Changed** → Update Guild `currentQueue`
3. **User Added Favorite** → Update `favorites`
4. **Bot Connected** → Update Guild `botStatus.connected`
