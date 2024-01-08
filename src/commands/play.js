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
        if (!res.tracks[0]) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่สามารถเข้าถึงเพลงได้`);

            return interaction.reply({ embeds: [embed], ephemeral: false });
        }
        const urls = res.tracks[0].uri;

        const video_id = urls.split('v=')[1];

        // แยก URL เพื่อดึงข้อมูลที่เป็น list

        const listPart = interaction.options.get('query').value.split('list=')[1];

        function getVideoIdPlaylist(listPart) {
            if (listPart) {
                return listPart.replace(/index=/, '');
            }
        }

        try {
            await player.connect();
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌บอทไม่มีอำนาจเปิดเพลงในห้อง ${channel.toString()}`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // if (listPart !== null) {
        //     console.log('List Part : ', listPart)
        //     // ลบ index=
        //     const  video_id_playlist = listPart.replace(/index=/, '');
        //     return video_id_playlist;
        // }

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
        global.interaction_global = interaction;

        await interaction.deferReply({ ephemeral: false });

        // ตรวจสอบเงื่อนไขเพื่อเลือกทำงานต่าง ๆ
        if (!player.playing && !player.paused && !player.queue.size && !res.playlist) {

            await player.queue.add(res.tracks[0]);
            const TimeMusic = convertTime(res.tracks[0].duration);
            global.TimeMusic = TimeMusic;
            player.play();

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`▶️┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)

            console.log(`[COMMAND] : Play ${res.tracks[0].title} in Channel: ${channel.name} Server: ${interaction.guild.name}(${player_guild_id})`);
            interaction.editReply({ embeds: [embed] });

        } else if (player.playing && !res.playlist) {
            await player.queue.add(res.tracks[0]);

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`📝┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \` \n ลำดับ: \` ${player.queue.size} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)
            interaction.editReply({ embeds: [embed] });
        } else if (res.loadType === 'PLAYLIST_LOADED') {
            // ถ้าเป็น playlist
            player.queue.add(res.tracks)
            player.setVolume(config.volume_default);
            player.play();

            video_id_playlist = getVideoIdPlaylist(listPart);

            if (res.playlist) {
                const embed = new EmbedBuilder()
                    .setColor(config.embed_color)
                    .setAuthor(
                        { name: 'Go to Playlist', iconURL: userAvatar, url: `https://www.youtube.com/playlist?list=${video_id_playlist}` }
                        )
                    .setDescription(`> 🎵 **Playlist:** ${res.playlist.name}\n> ⏱ **เวลา:** \` ${convertTime(res.playlist.duration)} \` \n> 📊 **มี:** \` ${res.tracks.length} \` เพลง \n> **ห้อง:** ${channel.toString()}`)
                    .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

                interaction.editReply({ embeds: [embed], ephemeral: false });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(red)
                    .setDescription(`> ❌ไม่สามารถดึงข้อมูลเพลย์ลิสต์ได้.`);

                interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    },
};
