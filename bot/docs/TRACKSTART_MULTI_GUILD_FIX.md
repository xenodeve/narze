# TrackStart Event - Multi-Guild Fix

การแก้ไข trackStart event เพื่อป้องกัน bug ในการใช้งาน multi-guild

## ปัญหาเดิม

```typescript
// ❌ วิธีเดิม - มี bug ใน multi-guild
for (const [key, value] of client.interactions) {
    return value.interaction.channel.send({ embeds: [embed] });
}
```

### ปัญหาที่เกิดขึ้น:
1. **Cross-Guild Messages**: เมื่อใช้บอทในหลาย guild พร้อมกัน interaction จะส่งข้อความไปยัง guild ที่ใช้ล่าสุด
2. **Wrong Channel**: ข้อความแจ้งเตือนอาจไปไม่ถูก channel
3. **Memory Leak**: เก็บ interaction ไว้ใน memory โดยไม่จำเป็น

## การแก้ไข

```typescript
// ✅ วิธีใหม่ - ใช้ channel จาก player
if (channel && 'send' in channel) {
    return (channel as any).send({ embeds: [embed] });
}
```

### ข้อดีของการแก้ไข:
1. **Guild-Specific**: ข้อความจะไปยัง channel ที่ถูกต้องเสมอ
2. **Performance**: ไม่ต้อง loop ผ่าน interactions
3. **Reliability**: ไม่พึ่งพา interaction state ที่อาจหมดอายุ

## การจัดการ User Avatar

### เดิม:
```typescript
const userAvatar = value.interaction.user.displayAvatarURL();
```

### ใหม่:
```typescript
let userAvatar = client.user?.displayAvatarURL();
if (track.requester) {
    try {
        // ลองดึง user จาก client
        const user = await client.users.fetch(track.requester as string);
        if (user) {
            userAvatar = user.displayAvatarURL();
        }
    } catch (error) {
        // หาก fetch ไม่ได้ ลองใช้จาก track.requester โดยตรง
        if (typeof track.requester === 'object' && 'displayAvatarURL' in track.requester) {
            userAvatar = (track.requester as any).displayAvatarURL();
        }
    }
}
```

### ข้อดีของการแก้ไข Avatar:
1. **Fallback System**: มี fallback หลายระดับ
2. **Accurate Requester**: แสดง avatar ของผู้ที่ request เพลงจริงๆ
3. **Error Handling**: จัดการ error เมื่อ fetch user ไม่ได้

## Channel Validation

```typescript
if (channel && 'send' in channel) {
    return (channel as any).send({ embeds: [embed] });
}
```

### การตรวจสอบ:
1. **Channel Exists**: ตรวจสอบว่า channel มีอยู่จริง
2. **Send Method**: ตรวจสอบว่า channel มี method `send`
3. **Type Casting**: ใช้ `as any` เพื่อหลีกเลี่ยง TypeScript error

## ผลลัพธ์

### ก่อนแก้ไข:
- ✅ Guild A เล่นเพลง → แจ้งเตือนที่ Guild A
- ❌ Guild B เล่นเพลง → แจ้งเตือนไปที่ Guild A (bug!)

### หลังแก้ไข:
- ✅ Guild A เล่นเพลง → แจ้งเตือนที่ Guild A
- ✅ Guild B เล่นเพลง → แจ้งเตือนที่ Guild B

## ข้อควรระวัง

1. **Player TextChannel**: ต้องแน่ใจว่า player มี textChannel ที่ถูกต้อง
2. **Channel Permissions**: บอทต้องมีสิทธิ์ send message ใน channel
3. **Error Handling**: ควรมี try-catch เพิ่มเติมสำหรับการส่งข้อความ

## ตัวอย่างการใช้งาน

```typescript
client.manager.on("trackStart" as any, async (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    
    if (!isActualFirstTrack && !isSkipplay) {
        if (channel && 'send' in channel) {
            const embed = new EmbedBuilder()
                .setDescription(`▶️ กำลังเล่น: ${track.info.title}`);
                
            await (channel as any).send({ embeds: [embed] });
        }
    }
});
```

## Migration Guide

หากมี event อื่นๆ ที่ใช้ pattern เดียวกัน ควรแก้ไขในลักษณะเดียวกัน:

1. **trackEnd.ts**
2. **playerMove.ts** 
3. **queueEnd.ts**

### Template สำหรับการแก้ไข:
```typescript
// เปลี่ยนจาก
for (const [key, value] of client.interactions) {
    return value.interaction.channel.send({ embeds: [embed] });
}

// เป็น
const channel = client.channels.cache.get(player.textChannel);
if (channel && 'send' in channel) {
    return (channel as any).send({ embeds: [embed] });
}
```
