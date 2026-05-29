# WebSocket Implementation Summary

## ✅ สิ่งที่ทำเสร็จ:

### 1. Bot API (Backend)
- ✅ ติดตั้ง `ws` และ `@types/ws` packages
- ✅ เพิ่ม WebSocket Server ใน `src/api/server.ts`
- ✅ ระบบ subscription แยกตาม guildId
- ✅ ส่งข้อมูลเริ่มต้นเมื่อ client subscribe
- ✅ Broadcast function สำหรับส่งข้อมูล real-time
- ✅ Hook WebSocket กับ Lavalink events:
  - `trackStart` - เมื่อเพลงเริ่มเล่น
  - `trackEnd` - เมื่อเพลงจบ

### 2. Dashboard (Frontend)
- ✅ แก้ไข `/api/player/[guildId]` ให้เรียก `/api/current-track/:guildId`
- ✅ แก้ไข `/api/queue/[guildId]` ให้เรียก `/api/queue/:guildId`
- ✅ สร้าง `useWebSocket` hook พร้อม:
  - Auto reconnect with exponential backoff
  - Subscribe/unsubscribe management
  - Error handling
- ✅ อัปเดต `NowPlayingSection` ให้ใช้ WebSocket
  - Real-time updates เมื่อเพลงเปลี่ยน
  - Fallback เป็น polling ถ้า WebSocket ไม่เชื่อมต่อ

## 📡 WebSocket Protocol:

### Client → Server:
```json
{
  "type": "subscribe",
  "guildId": "123456789"
}
```

### Server → Client:
```json
{
  "type": "trackStart",
  "guildId": "123456789",
  "data": {
    "track": {
      "title": "Song Title",
      "author": "Artist",
      "duration": 240000,
      "thumbnail": "https://...",
      "uri": "https://...",
      "requester": "user#1234"
    },
    "position": 0,
    "paused": false,
    "volume": 100,
    "playing": true
  },
  "timestamp": 1234567890
}
```

## 🚀 การใช้งาน:

### 1. เริ่ม Bot:
```bash
cd bot
bun run dev
```

Bot API จะรันที่ `http://localhost:3001`
WebSocket จะรันที่ `ws://localhost:3001`

### 2. เริ่ม Dashboard:
```bash
cd dashboard
npm run dev
```

Dashboard จะรันที่ `http://localhost:3000`

### 3. ตั้งค่า Environment:

#### Bot `.env`:
```env
API_PORT=3001
```

#### Dashboard `.env.local`:
```env
NEXT_PUBLIC_BOT_API_URL=http://localhost:3001
```

## 🎯 คุณสมบัติที่ได้:

✅ **Real-time Updates** - เห็นการเปลี่ยนแปลงทันทีไม่ต้อง refresh
✅ **Auto Reconnect** - เชื่อมต่อใหม่อัตโนมัติเมื่อขาดการเชื่อมต่อ
✅ **Guild-specific** - Subscribe เฉพาะ guild ที่ต้องการ
✅ **Fallback Polling** - ใช้ polling ถ้า WebSocket ไม่พร้อม
✅ **No Firebase Cost** - ไม่มีค่าใช้จ่าย Firebase
✅ **Low Latency** - อัปเดตภายใน milliseconds

## 📝 สิ่งที่ควรทำต่อ (Optional):

### 1. เพิ่ม WebSocket Events อื่นๆ:
- `queueUpdate` - เมื่อมีการเพิ่ม/ลบเพลงใน queue
- `playerPause` - เมื่อ pause/resume
- `volumeChange` - เมื่อเปลี่ยน volume
- `playerMove` - เมื่อย้าย voice channel

### 2. เพิ่ม Authentication:
```typescript
// ใน WebSocket connection
ws.on('message', (message) => {
  const { token, ...data } = JSON.parse(message);
  if (!verifyToken(token)) {
    ws.close();
    return;
  }
  // ...
});
```

### 3. อัปเดต QueueSection:
```typescript
// ในไฟล์ QueueSection.tsx
const { data: wsData } = useWebSocket(guildId);

useEffect(() => {
  if (wsData?.type === 'queueUpdate') {
    setQueue(wsData.data.queue);
  }
}, [wsData]);
```

## 🐛 Troubleshooting:

### WebSocket ไม่เชื่อมต่อ:
1. เช็คว่า Bot API รันอยู่
2. เช็ค `NEXT_PUBLIC_BOT_API_URL` ใน Dashboard
3. เช็ค console ใน browser สำหรับ errors

### ข้อมูลไม่อัปเดต:
1. เช็คว่า client subscribe ไป guildId ที่ถูกต้อง
2. เช็ค Bot console สำหรับ broadcast logs
3. เช็ค Dashboard console สำหรับ WebSocket messages

### การเชื่อมต่อขาดบ่อย:
1. เพิ่ม heartbeat/ping-pong mechanism
2. เพิ่ม maxReconnectAttempts
3. เช็ค network stability
