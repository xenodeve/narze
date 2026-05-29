# API Documentation

## Express.js API Server

API server ที่ให้ข้อมูลเกี่ยวกับสถานะของ bot และการเล่นเพลงในแต่ละ guild

### Setup

1. เพิ่ม `API_PORT` ในไฟล์ `.env`:
```env
API_PORT=3001
```

2. API server จะเริ่มทำงานอัตโนมัติเมื่อ bot พร้อมใช้งาน

### Available Endpoints

#### 1. Health Check
```
GET /api/health
```
ตรวจสอบสถานะของ API server

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-09T10:30:00.000Z"
}
```

#### 2. Bot Status
```
GET /api/status
```
ข้อมูลสถานะของ Discord bot

**Response:**
```json
{
  "botOnline": true,
  "botUser": "BotName#1234",
  "guildCount": 5,
  "uptime": 3600000,
  "timestamp": "2025-12-09T10:30:00.000Z"
}
```

#### 3. Current Track (All Guilds)
```
GET /api/current-track
```
ข้อมูลเพลงที่กำลังเล่นในทุก guild

**Response:**
```json
{
  "count": 2,
  "tracks": [
    {
      "guildId": "123456789",
      "guildName": "My Server",
      "track": {
        "title": "Song Title",
        "author": "Artist Name",
        "duration": 240000,
        "thumbnail": "https://...",
        "uri": "https://youtube.com/...",
        "requester": "user#1234"
      },
      "position": 30000,
      "paused": false,
      "volume": 100
    }
  ]
}
```

#### 4. Current Track (Specific Guild)
```
GET /api/current-track/:guildId
```
ข้อมูลเพลงที่กำลังเล่นใน guild ที่ระบุ

**Parameters:**
- `guildId` - Discord Guild ID

**Response:**
```json
{
  "guildId": "123456789",
  "guildName": "My Server",
  "track": {
    "title": "Song Title",
    "author": "Artist Name",
    "duration": 240000,
    "thumbnail": "https://...",
    "uri": "https://youtube.com/...",
    "requester": "user#1234"
  },
  "position": 30000,
  "paused": false,
  "volume": 100
}
```

#### 5. Queue (Specific Guild)
```
GET /api/queue/:guildId
```
ข้อมูล queue ของ guild ที่ระบุ

**Parameters:**
- `guildId` - Discord Guild ID

**Response:**
```json
{
  "guildId": "123456789",
  "guildName": "My Server",
  "current": {
    "title": "Current Song",
    "author": "Artist",
    "duration": 240000,
    "thumbnail": "https://...",
    "uri": "https://youtube.com/...",
    "requester": "user#1234"
  },
  "queue": [
    {
      "title": "Next Song",
      "author": "Artist",
      "duration": 180000,
      "thumbnail": "https://...",
      "uri": "https://youtube.com/...",
      "requester": "user#5678"
    }
  ],
  "queueLength": 1,
  "position": 30000,
  "paused": false,
  "volume": 100,
  "loop": "off"
}
```

#### 6. Active Guilds
```
GET /api/guilds
```
รายการ guild ที่มี player ทำงานอยู่

**Response:**
```json
{
  "count": 2,
  "guilds": [
    {
      "guildId": "123456789",
      "guildName": "My Server",
      "guildIcon": "https://cdn.discordapp.com/...",
      "memberCount": 100,
      "hasPlayer": true,
      "isPlaying": true,
      "queueLength": 5
    }
  ]
}
```

### CORS

API server เปิดใช้งาน CORS สำหรับทุก origin เพื่อให้ dashboard สามารถเรียกใช้ API ได้

### Error Responses

เมื่อเกิดข้อผิดพลาด API จะส่ง response ในรูปแบบ:
```json
{
  "error": "Error message"
}
```

### Example Usage (JavaScript)

```javascript
// Get bot status
const response = await fetch('http://localhost:3001/api/status');
const data = await response.json();
console.log(data);

// Get queue for specific guild
const guildId = '123456789';
const queueResponse = await fetch(`http://localhost:3001/api/queue/${guildId}`);
const queueData = await queueResponse.json();
console.log(queueData);
```
