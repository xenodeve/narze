const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../settings/config.json')
const { convertTime } = require('../structures/convertTime');
const { red } = require('color-name');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('เล่น | เพิ่มคิว')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('ชื่อเพลง หรือ ลิ้งก์')
                .setRequired(true)
        ),
    async execute(interaction, newUser, oldUser) {
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
            interaction.author,
        );

        const { channel } = interaction.member.voice;

        global.channel_text = interaction.channelId;


        const old_player = interaction.client.manager.get(interaction.guild.id);

        if (global.join_statue) {
            join = global.join_statue
        } else {
            join = false
        }

        if (old_player && !old_player.playing && join === false) {
            await old_player.destroy();
        }

        join = false
        

        const player = old_player || interaction.client.manager.create({
            guild: interaction.guild.id,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            selfDeafen: true,
        });
    

        if (old_player) {
            await player.set('old_play', true);
        } else {
            await player.set('old_player', false);
        }

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

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ตรวจสอบ Permissions ในห้องเสียง
        const memberVoiceChannel = interaction.member.voice.channel;
        const permissions = memberVoiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
            player.destroy();
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌บอทไม่มีอำนาจเปิดเพลงในห้อง ${channel.toString()}`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
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

        function F_Join_Play() {
            if (!player.playing) {
                player.connect();
                player.play();
            }
        }


        volume_player = global.volume_player;

        if (!volume_player) {
            player.setVolume(config.volume_default);
        }


        const userAvatar = interaction.user.displayAvatarURL();
        const userMention = interaction.user.toString();
        const player_guild_name = interaction.guild.name;
        const player_guild_id = player.guild;

        global.urls = urls;
        global.userMention = userMention;
        global.userAvatar = userAvatar;
        global.res = res;
        global.player = player;
        global.video_id = video_id;
        global.player_guild_name = player_guild_name;
        global.player_guild_id = player_guild_id;
        global.play_guild = interaction.guild;
        global.play_channel = channel;
        global.interaction_player = interaction;

        await interaction.deferReply({ ephemeral: false });

        const apiKey = config.youtube_api_key;
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video_id}&key=${apiKey}`;
        const response = await axios.get(apiUrl);
        const videoData = response.data.items[0];

        if (videoData && videoData.snippet.liveBroadcastContent === 'live') {
            // console.log('[Track] The music is live.');
            Live = true;
        } else {
            // console.log('[Track] The music is not live.');
            Live = false;
        }



        // ตรวจสอบเงื่อนไขเพื่อเลือกทำงานต่าง ๆ
        if (!player.playing && !player.paused && !player.queue.size && !res.playlist && Live == false) {
            await player.queue.add(res.tracks[0]);
            const TimeMusic = convertTime(res.tracks[0].duration);
            global.TimeMusic = TimeMusic;

            F_Join_Play();

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`▶️┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)

            return interaction.editReply({ embeds: [embed] });

        } else if (player.playing && !res.playlist && Live == false) {
            await player.queue.add(res.tracks[0]);

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`📝┃**${res.tracks[0].title}** \` ${convertTime(res.tracks[0].duration)} \` \n ลำดับ: \` ${player.queue.size} \``)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)
            return interaction.editReply({ embeds: [embed] });
        } else if (res.playlist && Live == false) {
            // ถ้าเป็น playlist

            await player.queue.add(res.tracks)
            F_Join_Play();

            video_id_playlist = getVideoIdPlaylist(listPart);

            if (res.playlist && Live == false) {
                player.set('playlist_first', true) 
                const embed = new EmbedBuilder()
                    .setColor(config.embed_color)
                    .setAuthor({ name: 'Go to Playlist', iconURL: userAvatar, url: `https://www.youtube.com/playlist?list=${video_id_playlist}` })
                    .setDescription(`> 🎵 **Playlist:** ${res.playlist.name}\n> ⏱ **เวลา:** \` ${convertTime(res.playlist.duration)} \` \n> 📊 **มี:** \` ${res.tracks.length} \` เพลง \n> **ห้อง:** ${channel.toString()}`)
                    .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

                return interaction.editReply({ embeds: [embed], ephemeral: false });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(red)
                    .setDescription(`> ❌ไม่สามารถดึงข้อมูลเพลย์ลิสต์ได้.`);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } else if (Live == true) {

            await player.queue.add(res.tracks[0]);
            F_Join_Play();

            // สร้าง Embed และแสดงผล
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Live', iconURL: userAvatar, url: urls })
                .setDescription(`🔴┃**${res.tracks[0].title}**`)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)
            return interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่สามารถดึงข้อมูล Live นี้ได้.`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
