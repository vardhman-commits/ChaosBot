import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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
                        .setDescription('Song name or URL (YouTube, Spotify, SoundCloud)')
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

            // 1. Get the Queue (or create a new one)
            const queue = musicManager.getQueue(guildId);

            // 2. Determine which Worker Bot to use
            if (!queue.workerObj) {
                const availableWorker = musicManager.getAvailableWorker(guildId);
                if (!availableWorker) {
                    return interaction.editReply('❌ All 5 Music Nodes are currently busy! Please try again later.');
                }
                queue.workerObj = availableWorker;
                queue.textChannel = interaction.channel;
            } else {
                // If a worker is already here, ensure the user is in the same VC
                const currentBotVC = queue.workerObj.client.guilds.cache.get(guildId).members.me.voice.channelId;
                if (currentBotVC && currentBotVC !== voiceChannel.id) {
                    return interaction.editReply(`❌ I am already playing music in <#${currentBotVC}>!`);
                }
            }

            // 3. Connect to the Voice Channel
            try {
                if (!queue.player) {
                    queue.player = await queue.workerObj.shoukaku.joinVoiceChannel({
                        guildId: guildId,
                        channelId: voiceChannel.id,
                        shardId: 0 // Default shard
                    });

                    // THE MISSING LINK: Tell the player to auto-play the next song when finished!
                    queue.player.on('end', () => {
                        musicManager.playNext(guildId);
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

            // 4. Search Lavalink for the song
            const node = queue.workerObj.shoukaku.options.nodeResolver(queue.workerObj.shoukaku.nodes);
            const result = await node.rest.resolve(query.startsWith('http') ? query : `ytsearch:${query}`);

            if (!result || result.data.length === 0) {
                return interaction.editReply('❌ No results found for that query.');
            }

            // 5. Add to Queue
            const track = result.type === 'PLAYLIST' ? result.data.tracks[0] : result.data[0];
            track.requester = interaction.user;
            queue.tracks.push(track);

            if (!queue.current) {
                await interaction.editReply(`🎵 **Starting playback:** \`${track.info.title}\``);
                await musicManager.playNext(guildId); // Start the engine!
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
            if (!queue.current) {
                return interaction.reply({ content: '❌ There is no music playing right now.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🎶 Server Music Queue')
                .setColor('#a855f7')
                .addFields({ name: '▶️ Now Playing', value: `**[${queue.current.info.title}](${queue.current.info.uri})**` });

            if (queue.tracks.length > 0) {
                const upcoming = queue.tracks.slice(0, 10).map((t, i) => `\`${i + 1}.\` ${t.info.title}`).join('\n');
                embed.addFields({ name: 'Up Next', value: upcoming });
                
                if (queue.tracks.length > 10) {
                    embed.setFooter({ text: `...and ${queue.tracks.length - 10} more tracks.` });
                }
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
            if (!queue.current || !queue.player) {
                return interaction.reply({ content: '❌ Nothing is playing to skip!', ephemeral: true });
            }
            
            queue.player.stopTrack(); 
            await interaction.reply('⏭️ **Skipped!**');
        }

        // ==========================================
        //               /MUSIC STOP
        // ==========================================
        if (sub === 'stop') {
            const queue = musicManager.getQueue(guildId);
            if (!queue.player) {
                return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
            }

            queue.tracks = []; 
            queue.loop = 'OFF';
            queue.player.stopTrack(); 
            
            await interaction.reply('⏹️ **Music stopped and queue cleared.**');
        }
    }
};
