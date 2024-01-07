const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json')
const { convertTime } = require('../structures/convertTime');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('เล่น / เพิ่มคิว')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('ชื่อเพลง หรือ ลิ้งก์')
                .setRequired(true)
        ),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        if (!query) return interaction.reply('กรุณาระบุเพลง');
        if (!interaction.member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }


        const res = await interaction.client.manager.search(
            query,
            interaction.author
        );

        const { channel } = interaction.member.voice;

        // const player = interaction.client.manager.create({
        //     guild: interaction.guild.id,
        //     voiceChannel: interaction.member.voice.channel.id,
        //     textChannel: interaction.channel.id,
        //     selfDeafen: true,
        // });

            const player = interaction.client.manager.get(interaction.guild.id) || interaction.client.manager.create({
                guild: interaction.guild.id,
                voiceChannel: interaction.member.voice.channel.id,
                textChannel: interaction.channel.id,
                selfDeafen: true,
            });


        if (interaction.member.voice.channel.id !== player.voiceChannel) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const urls = res.tracks[0].uri;
        const video_id = urls.split('v=')[1];
        const userAvatar = interaction.user.displayAvatarURL();
        const userMention = interaction.user.toString();
        const player_guild_name = interaction.guild.name;
        const player_guild_id = player.guild;

        global.player = player;
        global.urls = urls;
        global.userMention = userMention;
        global.userAvatar = userAvatar;
        global.res = res;
        global.video_id = video_id;
        global.player_guild_name = player_guild_name;
        global.player_guild_id = player_guild_id;

        await interaction.deferReply({ ephemeral: false });

        // ตรวจสอบเงื่อนไขเพื่อเลือกทำงานต่าง ๆ
        if (!player.playing && !player.paused && !player.queue.size) {

            await player.queue.add(res.tracks[0]);
            const TimeMusic = convertTime(res.tracks[0].duration);
            global.TimeMusic = TimeMusic;
            player.connect();
            player.setVolume(config.volume_default);
            player.play();

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`▶️┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)

            console.log(`[COMMAND] : Play ${res.tracks[0].title} in Channel: ${channel.name} Server: ${interaction.guild.name}(${player_guild_id})`);
            interaction.editReply({ embeds: [embed] });

        } else if (player.playing) {
            await player.queue.add(res.tracks[0]);

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`📝┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \` \n ลำดับ: \` ${player.queue.size} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)
            interaction.editReply({ embeds: [embed] });
        } 
    },
};

// else if(res.loadType == "PLAYLIST_LOADED") {
        //     await player.queue.add(res.tracks)

        //     const embed = new EmbedBuilder()
        //         .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
        //         .setDescription(`Playlist • ${res.playlist.name} \` ${convertTime(res.playlist.duration)} \` \n เพลง: \` ${res.tracks.length} \``)
        //         .setColor(config.embed_color)

        //     interaction.editReply({ content: " ", embeds: [embed] });
        //     if(!player.playing) player.play();
        // }
        // console.log('คิว play : ', player.queue.length, player.queue.size, player.queue.totalSize)