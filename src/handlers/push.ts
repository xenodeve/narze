import { readdirSync, statSync } from "fs";
import { join } from "path";
import { client } from "../index";
import chalk from "chalk";

export async function LoadCommands() {
  try {
    const commandsPath = join(__dirname, "../commands");
    const items = readdirSync(commandsPath);

    for (const item of items) {
      const itemPath = join(commandsPath, item);
      const isDirectory = statSync(itemPath).isDirectory();

      if (isDirectory) {
        // โหลดไฟล์ใน folder
        const commandFiles = readdirSync(itemPath).filter((file) => 
          file.endsWith(".ts") || file.endsWith(".js")
        );
        
        for (const file of commandFiles) {
          const command = await import(join(itemPath, file));
          if (command.default) {
            client.commands.set(command.default.name, command.default);
            console.log(`[${chalk.bold.cyan('COMMAND')}] Loaded: ${chalk.cyanBright(command.default.name)} ${chalk.cyanBright('(')}from ${chalk.cyanBright(`${item}`)}/${chalk.cyanBright(`${file})`)}`);
          } else {
            console.log(`[COMMAND] Failed to load: ${item}/${file}`)
          }
        }
      } else if (item.endsWith(".ts") || item.endsWith(".js")) {
        // โหลดไฟล์ใน commands โดยตรง
        const command = await import(itemPath);
        if (command.default) {
          client.commands.set(command.default.name, command.default);
          console.log(`[${chalk.bold.cyan('COMMAND')}] Loaded: ${chalk.cyanBright(command.default.name)} ${chalk.cyanBright('(')}from ${chalk.cyanBright(`${item})`)}`);
        }
      }
    }
    
    console.log(`[${chalk.bold.cyan('COMMAND')}] Loaded ${chalk.cyanBright(client.commands.size)} command(s)`);
  } catch (error) {
    console.error(`[${chalk.bold.redBright('COMMAND')}] ${chalk.bold.redBright('Error')} loading commands: ${chalk.bold.redBright(error)}`);
  }
}
