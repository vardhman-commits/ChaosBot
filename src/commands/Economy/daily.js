import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 24 * 60 * 60 * 1000; // 24 Hours

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily allowance of cash!'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastDaily = userData.lastDaily || 0;

        if (now < lastDaily + COOLDOWN) {
            const remaining = lastDaily + COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            return InteractionHelper.safeEditReply(interaction, { 
                content: `⏳ **You already claimed your daily!** Come back tomorrow in **${hours}h ${minutes}m**.` 
            });
        }

        // Daily Reward: $2,500 - $5,000
        const reward = Math.floor(Math.random() * 2500) + 2500;
        
        await EconomyService.addMoney(client, guildId, userId, reward, 'Daily Claim');
        
        userData.lastDaily = now;
        await setEconomyData(client, guildId, userId, userData);

        const embed = new EmbedBuilder()
            .setTitle('📅 Daily Reward Claimed!')
            .setColor('#f1c40f')
            .setDescription(`You logged in and claimed your daily allowance of **$${reward.toLocaleString()}**!`)
            .setFooter({ text: 'Come back in 24 hours for more.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
