import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import { logger } from '../utils/logger.js';

const Nodes = [{
    name: 'ChaosNode-Primary',
    url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
    auth: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE === 'true'
}];

class GuildQueue {
    constructor() {
        this.workerObj = null;    
        this.player = null;       
        this.tracks = [];         
        this.history = [];        
        this.current = null;      
        this.loop = 'OFF';        
        this.textChannel = null;  
        this.uiMessage = null;    
    }
}

export class MusicService {
    constructor() {
        this.workers = []; 
        this.queues = new Map(); 
    }

    async initWorkers(mainClient) {
        logger.info('Initializing Multi-Node Music System...');
        const tokens = [
            process.env.MUSIC_NODE_1_TOKEN,
            process.env.MUSIC_NODE_2_TOKEN,
            process.env.MUSIC_NODE_3_TOKEN,
            process.env.MUSIC_NODE_4_TOKEN,
            process.env.MUSIC_NODE_5_TOKEN
        ].filter(Boolean);

        if (tokens.length === 0) return logger.warn('No Music Worker tokens found.');

        for (let i = 0; i < tokens.length; i++) {
            const worker = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
            const shoukaku = new Shoukaku(new Connectors.DiscordJS(worker), Nodes);
            
            shoukaku.on('error', (_, err) => logger.error(`Lavalink Error (Worker ${i + 1}):`, err));
            shoukaku.on('ready', (name) => logger.info(`✅ Lavalink Node [${name}] connected for Worker ${i + 1}!`));

            this.workers.push({ client: worker, shoukaku });
            worker.login(tokens[i]).catch(err => logger.error(`❌ Worker [${i + 1}] Login Failed:`, err.message));
        }
    }

    getAvailableWorker(guildId) {
        return this.workers.find(w => {
            const guild = w.client.guilds.cache.get(guildId);
            return guild && !guild.members.me?.voice?.channel;
        }) || null;
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) this.queues.set(guildId, new GuildQueue());
        return this.queues.get(guildId);
    }

    formatTime(ms) {
        const s = Math.floor((ms / 1000) % 60);
        const m = Math.floor((ms / (1000 * 60)) % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    async playNext(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue || !queue.player) return;

        if (queue.current) {
            if (queue.loop === 'TRACK') queue.tracks.unshift(queue.current); 
            else if (queue.loop === 'QUEUE') queue.tracks.push(queue.current);    
            else queue.history.push(queue.current);   
        }

        if (queue.tracks.length === 0) {
            if (queue.uiMessage) await queue.uiMessage.delete().catch(() => null);
            await queue.textChannel?.send({ content: "🎶 Queue finished!" }).catch(() => null);
            queue.workerObj?.shoukaku.leaveVoiceChannel(guildId);
            this.queues.delete(guildId);
            return;
        }

        queue.current = queue.tracks.shift();
        
        // --- UNIVERSAL TRACK FIX ---
        // Checks for 'encoded' (v4) or 'track' (v3) to avoid Bad Request errors
        const trackData = queue.current.encoded || queue.current.track;
        
        if (!trackData) {
            logger.error('❌ Failed to play: Track data is missing!', queue.current);
            return this.playNext(guildId); // Skip broken track
        }

        try {
            await queue.player.playTrack({ track: trackData });
            await this.updatePlaybackUI(guildId);
        } catch (err) {
            logger.error('Lavalink Play Error:', err);
            this.playNext(guildId);
        }
    }

    async updatePlaybackUI(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue || !queue.current) return;

        const info = queue.current.info;
        const embed = new EmbedBuilder()
            .setColor(queue.player.paused ? '#e74c3c' : '#a855f7')
            .setTitle(info.title)
            .setURL(info.uri)
            .setDescription(`⏱️ **Duration:** \`${this.formatTime(info.length)}\` | **Queue:** \`${queue.tracks.length}\``)
            .setFooter({ text: `Requested by ${queue.current.requester.username}`, iconURL: queue.current.requester.displayAvatarURL() });

        if (info.uri.includes('youtube')) embed.setImage(`https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_pause').setEmoji(queue.player.paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('music_next').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );

        if (queue.uiMessage) await queue.uiMessage.delete().catch(() => null);
        queue.uiMessage = await queue.textChannel.send({ embeds: [embed], components: [row] });
    }

    async handleButtonInteraction(interaction) {
        const queue = this.getQueue(interaction.guildId);
        if (!queue?.player) return interaction.reply({ content: '❌ No active session.', ephemeral: true });
        
        await interaction.deferUpdate();
        if (interaction.customId === 'music_pause') queue.player.setPaused(!queue.player.paused);
        if (interaction.customId === 'music_next') queue.player.stopTrack();
        if (interaction.customId === 'music_stop') { queue.tracks = []; queue.player.stopTrack(); return; }
        await this.updatePlaybackUI(interaction.guildId);
    }
}
export const musicManager = new MusicService();
