# ADR-0002: Redis Pub/Sub เป็น IPC ระหว่าง Bot และ Backend

## Status
Accepted

## Context
Bot (`discordjs/`) และ Backend (`nestjs/`) เป็น process แยกกัน Bot เปลี่ยน player state บ่อย (track change, queue update, volume) — Backend ต้องรับรู้เพื่อ broadcast ต่อให้ Dashboard. Dashboard ส่ง commands ผ่าน Socket.io → Backend ต้องส่งต่อให้ Bot execute.

## Decision
ใช้ **Redis Pub/Sub** (via `ioredis`) เป็น bidirectional IPC ระหว่าง Bot และ Backend

Channel naming: `bot:{guildId}:{namespace}:{action}` และ `backend:{guildId}:{namespace}:{action}`

## Alternatives Considered
- **HTTP POST**: Bot เรียก NestJS REST endpoint เมื่อ state เปลี่ยน — simple แต่ coupling สูง (Bot ต้องรู้ NestJS URL), synchronous, Backend restart ทำให้ Bot ต้อง retry
- **รวม process**: Bot เป็น NestJS module เดียวกัน — ไม่มี IPC overhead แต่ debug/maintain ยากมาก (บทเรียนจาก v5.0.2)
- **`@nestjs/microservices` Redis transport**: built-in แต่ opinionated เกินไปสำหรับ goal ที่ Backend เป็น optional extension

## Rationale
- **Decoupled**: Bot ไม่รู้จัก NestJS URL หรือ port — publish แล้วจบ
- **Backend restart ไม่กระทบ Bot**: Bot publish ไปที่ Redis เสมอ Backend pick up เมื่อพร้อม
- **Scalable**: ถ้าต้องการเพิ่ม service อื่น (logging, analytics) subscribe Redis channel ได้เลย
- **`ioredis` โดยตรง**: flexible กว่า NestJS microservices transport, ไม่ผูก pattern

## Consequences
- Redis เป็น required dependency เมื่อรัน Connected mode (Bot + Backend)
- Bot ต้องมี reconnect logic สำหรับ Redis connection
- ถ้า Redis ล่ม Dashboard ไม่ sync — Bot ยังทำงานได้ปกติ (switch to Standalone mode)
