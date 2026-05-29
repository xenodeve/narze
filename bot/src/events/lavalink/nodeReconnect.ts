import chalk from "chalk";
import { client } from "../..";

client.manager.on("nodeReconnect" as any, (node) => {
    console.log(`[${chalk.bold.yellowBright('NODE')}] ${node.host} ${chalk.yellowBright('reconnected.')}`);
})