import chalk from "chalk";
import { client } from "../..";

// ป้องกันการ register event ซ้ำ
if (client.manager.listenerCount("nodeConnect") === 0) {
    client.manager.on("nodeConnect" as any, (node) => {
        console.log(`[${chalk.bold.greenBright('NODE')}] ${node.host} ${chalk.greenBright('connected.')}`);
    });
}