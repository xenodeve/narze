import { readdirSync, statSync } from "fs";
import { join } from "path";
import chalk from "chalk";

export async function LoadEvents() {
  try {
    const eventsPath = join(__dirname, "../events");
    const items = readdirSync(eventsPath);
    let eventCount = 0; // นับจำนวน events ที่โหลด

    for (const item of items) {
      const itemPath = join(eventsPath, item);
      const isDirectory = statSync(itemPath).isDirectory();

      if (isDirectory) {
        // โหลดไฟล์ใน folder
        const eventFiles = readdirSync(itemPath).filter((file) => 
          file.endsWith(".ts") || file.endsWith(".js")
        );
        
        for (const file of eventFiles) {
          // แค่ import ไฟล์ - client.on() จะทำงานอัตโนมัติ
          require(join(itemPath, file));
          const eventName = file.replace(/\.(ts|js)$/, ''); // ลบ .ts หรือ .js ออก
          console.log(`[${chalk.bold.blueBright('EVENT')}] ${chalk.blueBright('Loaded:')} ${eventName} ${chalk.blueBright('(from')} ${item}/${file}${chalk.blueBright(')')}`);
          eventCount++; // เพิ่มจำนวน
        }
      } else if (item.endsWith(".ts") || item.endsWith(".js")) {
        // โหลดไฟล์ใน events โดยตรง
        // แค่ import ไฟล์ - client.on() จะทำงานอัตโนมัติ
        require(join(eventsPath, item));
        const eventName = item.replace(/\.(ts|js)$/, ''); // ลบ .ts หรือ .js ออก
        console.log(`[${chalk.bold.blueBright('EVENT')}] ${chalk.blueBright('Loaded:')} ${eventName} ${chalk.blueBright('(from')} ${item}${chalk.blueBright(')')}`);
        eventCount++; // เพิ่มจำนวน
      }
    }

    console.log(`[${chalk.bold.blueBright('EVENT')}] Loaded ${chalk.blueBright(eventCount)} event(s)`);
    // console.log(`[${chalk.bold.blueBright('SYSTEM')}] ${chalk.blueBright('Loaded')} ${eventCount} ${chalk.blueBright('event(s) successfully')}`);
  } catch (error) {
    console.error(`[${chalk.bold.redBright('EVENT ERROR')}]`, error);
  }
}