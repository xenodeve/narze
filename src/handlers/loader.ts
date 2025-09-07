import { LoadEvents } from "./events"
import { LoadCommands } from "./push";

export function Handlers() {
    LoadEvents();
    LoadCommands();
}