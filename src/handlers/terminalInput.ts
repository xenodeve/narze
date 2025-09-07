import * as readline from 'readline';
import { TerminalCommandHandler } from './terminalCommands';
import { clientBot } from '../interfaces/client';
import chalk from 'chalk';

class TerminalInput {
    private rl: readline.Interface;
    private commandHandler: TerminalCommandHandler;
    private isListening: boolean = false;

    constructor(client: clientBot) {
        this.commandHandler = new TerminalCommandHandler(client);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.bold.cyan('Narze Terminal > ')
        });

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.rl.on('line', (input) => {
            const command = input.trim();
            
            if (!command) {
                this.rl.prompt();
                return;
            }

            if (command === 'exit' || command === 'quit') {
                console.log(chalk.bold.yellow('Shutting down terminal...'));
                this.stop();
                return;
            }

            if (command === 'clear' || command === 'cls') {
                console.clear();
                this.showWelcome();
                this.rl.prompt();
                return;
            }

            // ส่งคำสั่งไปยัง command handler
            this.commandHandler.addCommand(command);
            this.rl.prompt();
        });

        this.rl.on('close', () => {
            console.log(chalk.bold.yellow('Terminal closed.'));
        });

        // Handle Ctrl+C
        this.rl.on('SIGINT', () => {
            console.log(chalk.bold.yellow('\nReceived SIGINT. Type "exit" to quit.'));
            this.rl.prompt();
        });
    }

    public start() {
        if (this.isListening) return;
        
        this.isListening = true;
        this.showWelcome();
        this.rl.prompt();
        
        console.log(chalk.bold.green('Terminal input started. Type "help" for commands.'));
    }

    public stop() {
        this.isListening = false;
        this.rl.close();
    }

    private showWelcome() {
        console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('║        Discord Narze Terminal        ║'));
        console.log(chalk.bold.cyan('╚══════════════════════════════════════╝'));
        console.log(chalk.bold.white('🎵 Music Narze Terminal Commands:'));
        console.log(chalk.bold.green('  play <query> <guild> <voice> [text]') + chalk.white(' - Play music'));
        console.log(chalk.bold.green('  stop <guild>                       ') + chalk.white(' - Stop playback'));
        console.log(chalk.bold.green('  skip <guild>                       ') + chalk.white(' - Skip track'));
        console.log(chalk.bold.green('  status [guild]                     ') + chalk.white(' - Show status'));
        console.log(chalk.bold.green('  list                               ') + chalk.white(' - Show guilds & channels'));
        console.log(chalk.bold.green('  find guild <name>                  ') + chalk.white(' - Find guild'));
        console.log(chalk.bold.green('  find text <guild> <name>           ') + chalk.white(' - Find text channel'));
        console.log(chalk.bold.green('  help                               ') + chalk.white(' - Show all commands'));
        console.log(chalk.bold.cyan('\n💡 Tips:'));
        console.log(chalk.bold.yellow('  • Text channel is optional - auto-selects if not specified'));
        console.log(chalk.bold.yellow('  • Use guild/channel names or IDs'));
        console.log(chalk.bold.yellow('  • Put song names in quotes: "Imagine Dragons Bones"'));
        console.log(chalk.bold.yellow('  • Use "list" to see all available servers and channels'));
        console.log(chalk.bold.white('\n📖 Full documentation: docs/terminal-commands.md\n'));
    }
}

export { TerminalInput };
