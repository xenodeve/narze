# ADR-0001: Socket.io แทน SSE สำหรับ Real-time Communication

## Status
Accepted

## Context
V6 ต้องการ real-time sync ระหว่าง Dashboard และ Bot state. แผนเดิมใช้ REST สำหรับ commands และ SSE (Server-Sent Events) สำหรับ server→client push.

## Decision
ใช้ **Socket.io** แทน SSE + REST สำหรับ real-time layer ทั้งหมด

- Commands (play, pause, skip, queue reorder) ส่งผ่าน Socket.io client→server
- State updates (player state, queue changes, bot status) ส่งผ่าน Socket.io server→client
- REST คงอยู่เฉพาะ Supabase Auth callback (`/api/auth/callback`)

## Alternatives Considered
- **SSE + REST**: SSE ทำ server→client push ได้ แต่ต้องมีสอง protocol — REST สำหรับ commands, SSE สำหรับ updates เพิ่ม complexity client และ server
- **Native WebSocket (`ws`)**: เบากว่า แต่ต้องเขียน reconnect logic และ room (per-guild) เอง

## Rationale
- **Single protocol**: ไม่ต้องแยก REST endpoint กับ SSE endpoint — ทุก real-time interaction ผ่าน Socket.io
- **Rooms built-in**: `server.to('guild:123').emit(...)` สำหรับ per-guild broadcast โดยไม่ต้องเขียน map เอง
- **Auto-reconnect**: Socket.io handle reconnect ให้อัตโนมัติ — SSE ใช้ browser auto-reconnect แต่ native WS ไม่มี
- **NestJS Gateway**: Socket.io เป็น first-class citizen ใน NestJS — decorator pattern เหมือน REST controller

## Consequences
- Frontend ต้องติด `socket.io-client` (+14KB bundle)
- Socket.io protocol ไม่ใช่ pure WebSocket — ถ้าต้องการ interop กับ client อื่นที่ไม่ใช่ socket.io-client ต้องพิจารณาใหม่
