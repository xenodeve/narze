import { client } from "..";

client.on("raw", (data) => {
    client.manager.updateVoiceState(data);
});
