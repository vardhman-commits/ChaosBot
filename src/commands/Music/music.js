import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { musicManager } from '../../services/musicService.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Chaos Music System')
        .addSubcommand(sub =>
            sub.setName('play').setDescription('Play music')
                .addStringOption(opt => opt.setName('query').setDescription('Song name or URL').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('stop').setDescription('Stop music')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) return interaction.reply({ content: '❌ Join a VC first!', ephemeral: true });

        if (sub === 'play') {
            await interaction.deferReply();
            const query = interaction.options.getString('query');
            const queue = musicManager.getQueue(guildId);

            if (!queue.workerObj) {
                queue.workerObj = musicManager.getAvailableWorker(guildId);
                if (!queue.workerObj) return interaction.editReply('❌ No free music nodes!');
                queue.textChannel = interaction.channel;
            }

            try {
                if (!queue.player) {
                    queue.player = await queue.workerObj.shoukaku.joinVoiceChannel({
                        guildId, channelId: voiceChannel.id, shardId: 0
                    });
                    queue.player.on('end', () => musicManager.playNext(guildId));
                }
            } catch (err) {
                return interaction.editReply('❌ VC Connection Failed.');
            }

            const node = queue.workerObj.shoukaku.options.nodeResolver(queue.workerObj.shoukaku.nodes);
            let result = await node.rest.resolve(query.includes('http') ? query : `ytsearch:${query}`);

            // SoundCloud Fallback for YouTube blocks
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                if (!query.includes('http')) {
                    logger.warn(`Youtube failed for "${query}". Falling back to SoundCloud...`);
                    result = await node.rest.resolve(`scsearch:${query}`);
                }
            }

            if (!result || result.loadType === 'empty') return interaction.editReply('❌ No results found.');

            // --- ROBUST TRACK EXTRACTION ---
            let track;
            // Handle both Lavalink v3 and v4 data structures
            const tracks = result.data?.tracks || result.tracks || (Array.isArray(result.data) ? result.data : [result.data]);
            track = tracks[0];

            if (!track) return interaction.editReply('❌ Could not parse track.');

            track.requester = interaction.user;
            queue.tracks.push(track);

            if (!queue.current) {
                await interaction.editReply(`🎶 Playing: **${track.info.title}**`);
                await musicManager.playNext(guildId);
            } else {
                await interaction.editReply(`✅ Added to queue: **${track.info.title}**`);
                await musicManager.updatePlaybackUI(guildId);
            }
        }

        if (sub === 'stop') {
            const queue = musicManager.getQueue(guildId);
            if (queue.player) {
                queue.tracks = [];
                queue.player.stopTrack();
                await interaction.reply('⏹️ Stopped.');
            }
        }
    }
};
