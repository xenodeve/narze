import chalk from "chalk";
import { client } from "../..";

client.manager.on("nodeConnect" as any, (node) => {
    console.log(`[${chalk.bold.greenBright('NODE')}] ${node.host} ${chalk.greenBright('connected.')}`);
})