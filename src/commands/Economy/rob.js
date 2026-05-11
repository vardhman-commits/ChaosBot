import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 45 * 60 * 1000; // 45 Minutes

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Attempt a dangerous crime for a massive payout. High chance of jail time!'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastCrime = userData.lastCrime || 0;

        if (now < lastCrime + COOLDOWN) {
            const remaining = lastCrime + COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            return InteractionHelper.safeEditReply(interaction, { 
                content: `🚓 **You're on the FBI Watchlist!** Lay low for **${minutes}m ${seconds}s** before your next heist.` 
            });
        }

        // 45% Success Chance
        const isSuccess = Math.random() < 0.45;
        let embed = new EmbedBuilder();

        if (isSuccess) {
            const reward = Math.floor(Math.random() * 3000) + 1500; // $1,500 - $4,500
            await EconomyService.addMoney(client, guildId, userId, reward, 'Successful Crime');
            
            embed.setTitle('🥷 Heist Successful!')
                .setColor('#2ecc71')
                .setDescription(`You hacked the mainframe, bypassed the lasers, and escaped with the vault cash!\n\n💰 **+ $${reward.toLocaleString()}**`)
                .setFooter({ text: 'Smooth criminal.' });
        } else {
            const fine = Math.floor(Math.random() * 1000) + 500; // Lose $500 - $1,500
            const currentWallet = userData.wallet || 0;
            const actualFine = Math.min(fine, currentWallet); 
            
            await EconomyService.removeMoney(client, guildId, userId, actualFine, 'Crime Fine (Busted)');
            
            embed.setTitle('🚨 BUSTED!')
                .setColor('#e74c3c')
                .setDescription(`The SWAT team was waiting for you! You were arrested and forced to pay a massive bail fine.\n\n💸 **- $${actualFine.toLocaleString()}**`)
                .setFooter({ text: 'Crime doesn\'t pay... usually.' });
        }

        userData.lastCrime = now;
        await setEconomyData(client, guildId, userId, userData);

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
