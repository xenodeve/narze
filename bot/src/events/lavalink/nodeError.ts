import chalk from "chalk";
import { client } from "../..";

client.manager.on("nodeError" as any, (node, error) => {
    // แปลง error object ให้เป็น readable format
    let errorMessage;
    
    if (error instanceof Error) {
        errorMessage = error.message;
    } else if (error?.message) {
        errorMessage = error.message;
    } else if (error?.reason) {
        errorMessage = error.reason;
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        // ถ้าเป็น object ให้แสดงเป็น JSON
        errorMessage = JSON.stringify(error, null, 2);
    }
    
    console.log(`[${chalk.bold.redBright('NODE')}] ${chalk.redBright('Host:')} ${node.host}`);
    console.log(`[${chalk.bold.redBright('NODE')}] ${chalk.redBright('Message:')} ${errorMessage}`);
    
    // แสดง error object เต็มๆ ถ้าต้องการ debug
    // console.log(`[${chalk.bold.redBright('NODE')}] ${chalk.redBright('Full Error:')}`, error);
})