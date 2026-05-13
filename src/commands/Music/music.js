import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { musicManager } from '../../services/musicService.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Advanced Multi-Node Music System')
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('Play a song or playlist')
                .addStringOption(option => 
                    option.setName('query')
                        .setDescription('Song name or URL (YouTube/SoundCloud)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('queue')
                .setDescription('View the current server queue')
        )
        .addSubcommand(sub =>
            sub.setName('skip')
                .setDescription('Skip the currently playing song')
        )
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('Stop the music and clear the queue')
        ),

    category: 'Music',

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You must be in a Voice Channel to use music commands!', ephemeral: true });
        }

        // ==========================================
        //               /MUSIC PLAY
        // ==========================================
        if (sub === 'play') {
            await interaction.deferReply();
            const query = interaction.options.getString('query');

            const queue = musicManager.getQueue(guildId);

            if (!queue.workerObj) {
                const availableWorker = musicManager.getAvailableWorker(guildId);
                if (!availableWorker) {
                    return interaction.editReply('❌ All Music Nodes are busy or not invited to this server! Please try again later.');
                }
                queue.workerObj = availableWorker;
                queue.textChannel = interaction.channel;
            } else {
                const currentBotVC = queue.workerObj.client.guilds.cache.get(guildId).members.me.voice.channelId;
                if (currentBotVC && currentBotVC !== voiceChannel.id) {
                    return interaction.editReply(`❌ I am already playing music in <#${currentBotVC}>!`);
                }
            }

            const workerMember = queue.workerObj.client.guilds.cache.get(guildId).members.me;
            const permissions = voiceChannel.permissionsFor(workerMember);
            
            if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
                return interaction.editReply(`❌ My music worker (<@${workerMember.user.id}>) cannot see the voice channel <#${voiceChannel.id}>.`);
            }
            if (!permissions.has(PermissionFlagsBits.Connect)) {
                return interaction.editReply(`❌ My music worker (<@${workerMember.user.id}>) does not have permission to CONNECT to <#${voiceChannel.id}>.`);
            }
            if (voiceChannel.userLimit && voiceChannel.members.size >= voiceChannel.userLimit && !permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.editReply(`❌ The voice channel <#${voiceChannel.id}> is full!`);
            }

            try {
                if (!queue.player) {
                    queue.player = await queue.workerObj.shoukaku.joinVoiceChannel({
                        guildId: guildId,
                        channelId: voiceChannel.id,
                        shardId: workerMember.guild.shardId || 0
                    });

                    queue.player.on('end', (data) => {
                        if (data && data.reason === 'REPLACED') return;
                        musicManager.playNext(guildId);
                    });

                    queue.player.on('exception', (data) => {
                        logger.warn(`Lavalink Exception: ${data.exception?.message}`);
                        queue.textChannel?.send(`⚠️ **Stream Error:** Could not stream this audio. Skipping to next...`).catch(() => null);
                        queue.player.stopTrack(); 
                    });

                    queue.player.on('closed', () => {
                        queue.workerObj.shoukaku.leaveVoiceChannel(guildId);
                        musicManager.queues.delete(guildId);
                    });
                }
            } catch (error) {
                logger.error('Failed to join VC:', error);
                return interaction.editReply('❌ Failed to connect to the voice channel.');
            }

            const node = queue.workerObj.shoukaku.options.nodeResolver(queue.workerObj.shoukaku.nodes);
            
            // 🔥 Because the YouTube plugin is installed, ytsearch: will now bypass the 403 IP block!
            let searchEngine = query.startsWith('http') ? query : `ytsearch:${query}`;
            let result = await node.rest.resolve(searchEngine);

            // Fallback to SoundCloud just in case
            if (!result || ['empty', 'error', 'NO_MATCHES', 'LOAD_FAILED'].includes(result.loadType)) {
                if (!query.startsWith('http')) {
                    logger.warn(`YouTube search failed for "${query}". Falling back to SoundCloud...`);
                    result = await node.rest.resolve(`scsearch:${query}`);
                }
            }

            if (!result || ['empty', 'error', 'NO_MATCHES', 'LOAD_FAILED'].includes(result.loadType)) {
                return interaction.editReply('❌ No results found. *(Note: If you pasted a direct link, it might be broken. Try typing the song name instead!)*');
            }

            let track;
            if (result.loadType === 'PLAYLIST_LOADED' || result.loadType === 'playlist') {
                track = result.data.tracks[0];
            } else if (Array.isArray(result.data)) {
                track = result.data[0]; 
            } else {
                track = result.data; 
            }

            if (!track || !track.info) {
                return interaction.editReply('❌ Failed to parse the audio track.');
            }

            track.requester = interaction.user;
            queue.tracks.push(track);

            if (!queue.current) {
                await interaction.editReply(`🎵 **Starting playback:** \`${track.info.title}\``);
                await musicManager.playNext(guildId); 
            } else {
                await interaction.editReply(`✅ **Added to queue:** \`${track.info.title}\``);
                await musicManager.updatePlaybackUI(guildId); 
            }
        }

        // ==========================================
        //               /MUSIC QUEUE
        // ==========================================
        if (sub === 'queue') {
            const queue = musicManager.getQueue(guildId);
            if (!queue.current) return interaction.reply({ content: '❌ There is no music playing right now.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🎶 Server Music Queue')
                .setColor('#a855f7')
                .addFields({ name: '▶️ Now Playing', value: `**[${queue.current.info.title}](${queue.current.info.uri})**` });

            if (queue.tracks.length > 0) {
                const upcoming = queue.tracks.slice(0, 10).map((t, i) => `\`${i + 1}.\` ${t.info.title}`).join('\n');
                embed.addFields({ name: 'Up Next', value: upcoming });
                if (queue.tracks.length > 10) embed.setFooter({ text: `...and ${queue.tracks.length - 10} more tracks.` });
            } else {
                embed.addFields({ name: 'Up Next', value: '*Queue is empty.*' });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==========================================
        //               /MUSIC SKIP
        // ==========================================
        if (sub === 'skip') {
            const queue = musicManager.getQueue(guildId);
            if (!queue.current || !queue.player) return interaction.reply({ content: '❌ Nothing is playing to skip!', ephemeral: true });
            
            queue.player.stopTrack(); 
            await interaction.reply('⏭️ **Skipped!**');
        }

        // ==========================================
        //               /MUSIC STOP
        // ==========================================
        if (sub === 'stop') {
            const queue = musicManager.getQueue(guildId);
            if (!queue.player) return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });

            queue.tracks = []; 
            queue.loop = 'OFF';
            queue.player.stopTrack(); 
            
            await interaction.reply('⏹️ **Music stopped and queue cleared.**');
        }
    }
};
