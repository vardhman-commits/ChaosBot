import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import { logger } from '../utils/logger.js';

// Lavalink Node Configuration
const Nodes = [{
    name: 'ChaosNode-Primary',
    url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
    auth: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE === 'true'
}];

// Class to manage the state of each server's music queue
class GuildQueue {
    constructor() {
        this.workerObj = null;    // Object holding { client, shoukaku }
        this.player = null;       // The Shoukaku audio player
        this.tracks = [];         // Upcoming songs
        this.history = [];        // Previously played songs
        this.current = null;      // Currently playing song
        this.loop = 'OFF';        // 'OFF', 'TRACK', or 'QUEUE'
        this.textChannel = null;  // Where to send the UI message
        this.uiMessage = null;    // The actual Discord message object holding the buttons
    }
}

export class MusicService {
    constructor() {
        this.workers = []; // Array to store { client, shoukaku }
        this.queues = new Map(); // guildId -> GuildQueue
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

        if (tokens.length === 0) {
            logger.warn('No Music Worker tokens found in .env. Music system disabled.');
            return;
        }

        // Boot worker bots and give EACH one its own Shoukaku connection
        for (let i = 0; i < tokens.length; i++) {
            const worker = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
            
            await new Promise((resolve) => {
                worker.once('ready', () => {
                    logger.info(`🎵 Worker [${i + 1}] Ready: ${worker.user.tag}`);
                    
                    // Initialize Shoukaku SPECIFICALLY for this worker bot
                    const shoukaku = new Shoukaku(new Connectors.DiscordJS(worker), Nodes);
                    
                    shoukaku.on('error', (_, err) => logger.error(`Lavalink Error (Worker ${i + 1}):`, err));
                    shoukaku.on('ready', (name) => logger.info(`✅ Lavalink Node [${name}] connected for Worker ${i + 1}!`));

                    this.workers.push({ client: worker, shoukaku });
                    resolve();
                });
                
                worker.login(tokens[i]).catch(err => {
                    logger.error(`❌ Worker [${i + 1}] Login Failed:`, err.message);
                    resolve(); 
                });
            });
        }
    }

    // Assigns an idle worker bot to a VC
    getAvailableWorker(guildId) {
        if (this.workers.length === 0) return null;
        for (const workerObj of this.workers) {
            const guild = workerObj.client.guilds.cache.get(guildId);
            // Check if this specific worker bot is currently sitting in a Voice Channel
            if (guild && !guild.members.me?.voice?.channel) {
                return workerObj; // Found a free worker!
            }
        }
        return null; 
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, new GuildQueue());
        }
        return this.queues.get(guildId);
    }

    formatTime(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` 
                         : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // --- CORE AUDIO LOGIC ---
    async playNext(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue || !queue.player) return;

        // Handle Looping logic
        if (queue.current) {
            if (queue.loop === 'TRACK') {
                queue.tracks.unshift(queue.current); 
            } else if (queue.loop === 'QUEUE') {
                queue.tracks.push(queue.current);    
            } else {
                queue.history.push(queue.current);   
            }
        }

        if (queue.tracks.length === 0) {
            // Queue is empty! Clean up and leave.
            if (queue.uiMessage) await queue.uiMessage.delete().catch(() => null);
            await queue.textChannel?.send({ content: "🎶 The queue has ended. I'm leaving the voice channel!" }).catch(() => null);
            
            if (queue.workerObj) {
                queue.workerObj.shoukaku.leaveVoiceChannel(guildId);
            }
            this.queues.delete(guildId);
            return;
        }

        queue.current = queue.tracks.shift();
        
        // Tell Lavalink to play the track
        await queue.player.playTrack({ track: queue.current.encoded });
        await this.updatePlaybackUI(guildId);
    }

    // --- THE BEAUTIFUL UI BUILDER ---
    async updatePlaybackUI(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue || !queue.current) return;

        const trackInfo = queue.current.info;
        const isPaused = queue.player.paused;

        const embed = new EmbedBuilder()
            .setColor(isPaused ? '#e74c3c' : '#a855f7')
            .setAuthor({ name: isPaused ? '⏸️ Paused' : '▶️ Now Playing' })
            .setTitle(trackInfo.title)
            .setURL(trackInfo.uri)
            .setDescription(`👤 **Author:** ${trackInfo.author}\n⏱️ **Duration:** \`${this.formatTime(trackInfo.length)}\`\n🎵 **In Queue:** \`${queue.tracks.length}\` track(s)`)
            .setFooter({ text: `Requested by ${queue.current.requester.username} • Loop: ${queue.loop}`, iconURL: queue.current.requester.displayAvatarURL() });

        if (trackInfo.uri.includes('youtube.com') || trackInfo.uri.includes('youtu.be')) {
            embed.setImage(`https://img.youtube.com/vi/${trackInfo.identifier}/maxresdefault.jpg`);
        }

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('music_prev')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(queue.history.length === 0),
            new ButtonBuilder()
                .setCustomId('music_pause')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('music_next')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(queue.tracks.length === 0 && queue.loop === 'OFF'),
            new ButtonBuilder()
                .setCustomId('music_loop')
                .setEmoji('🔁')
                .setStyle(queue.loop === 'OFF' ? ButtonStyle.Secondary : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger)
        );

        try {
            if (queue.uiMessage) {
                await queue.uiMessage.delete().catch(() => null);
            }
            queue.uiMessage = await queue.textChannel.send({ embeds: [embed], components: [buttons] });
        } catch (error) {
            logger.error(`Failed to send Music UI in ${guildId}:`, error.message);
        }
    }

    // --- BUTTON HANDLER LOGIC ---
    async handleButtonInteraction(interaction) {
        const guildId = interaction.guildId;
        const queue = this.getQueue(guildId);

        if (!queue || !queue.player) {
            return interaction.reply({ content: '❌ There is no active music session right now.', ephemeral: true });
        }

        // Must be in the same voice channel to use buttons
        if (interaction.member.voice.channelId !== queue.workerObj.client.guilds.cache.get(guildId).members.me.voice.channelId) {
            return interaction.reply({ content: '❌ You must be in my voice channel to use these controls!', ephemeral: true });
        }

        await interaction.deferUpdate();

        switch (interaction.customId) {
            case 'music_pause':
                queue.player.setPaused(!queue.player.paused);
                break;
                
            case 'music_next':
                queue.player.stopTrack(); 
                break;
                
            case 'music_prev':
                if (queue.history.length > 0) {
                    const prevTrack = queue.history.pop();
                    queue.tracks.unshift(queue.current); 
                    queue.tracks.unshift(prevTrack);     
                    queue.current = null; 
                    queue.player.stopTrack(); 
                }
                break;
                
            case 'music_loop':
                if (queue.loop === 'OFF') queue.loop = 'QUEUE';
                else if (queue.loop === 'QUEUE') queue.loop = 'TRACK';
                else queue.loop = 'OFF';
                break;

            case 'music_stop':
                queue.tracks = []; 
                queue.loop = 'OFF';
                queue.player.stopTrack(); 
                return; 
        }

        await this.updatePlaybackUI(guildId);
    }
}

export const musicManager = new MusicService();
