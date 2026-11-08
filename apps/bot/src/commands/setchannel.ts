import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { fail, ok } from "./replies";
import type { Command } from "./types";

/** /setchannel (spec #12): the Music Channel for the Bot's notices; no channel clears it. */
export const setchannel: Command = {
  data: new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("ตั้งค่า Music Text Channel สำหรับบอท")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("เลือก Text Channel สำหรับส่งข้อความเกี่ยวกับเพลง (ไม่ระบุ = ลบการตั้งค่า)")
        .addChannelTypes(ChannelType.GuildText),
    ),
  async run(ctx) {
    if (!ctx.setMusicChannel) return fail("เกิดข้อผิดพลาดในการตั้งค่า กรุณาลองใหม่อีกครั้ง");
    const channel = ctx.option("channel");
    const id = channel === null ? null : String(channel);
    const result = await ctx.setMusicChannel(id).catch(() => "failed" as const);
    if (result === "forbidden") return fail("เฉพาะเจ้าของเซิร์ฟเวอร์หรือ Bot Owner ที่เปลี่ยนการตั้งค่าได้");
    if (result === "cannot-post") return fail(`บอทส่งข้อความในห้อง <#${id}> ไม่ได้`);
    if (result === "failed") return fail("เกิดข้อผิดพลาดในการตั้งค่า กรุณาลองใหม่อีกครั้ง");
    return ok(
      id
        ? `✅ ตั้งค่า Music Channel เป็น <#${id}> สำเร็จ!\n\nบอทจะส่งข้อความเกี่ยวกับเพลงใน channel นี้`
        : "✅ ลบการตั้งค่า Music Channel แล้ว\n\nบอทจะส่งข้อความใน channel ที่สั่งเพลง",
      { title: "⚙️ | ตั้งค่า Music Channel", footer: `ตั้งค่าโดย ${ctx.user.name}` },
      true,
    );
  },
};
