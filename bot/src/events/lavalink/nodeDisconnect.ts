import chalk from "chalk";
import { client } from "../..";

client.manager.on("nodeDisconnect" as any, (node, player) => {
    console.log(`[${chalk.bold.yellowBright('NODE')}] ${node.host} ${chalk.yellowBright('disconnected.')}`);
})