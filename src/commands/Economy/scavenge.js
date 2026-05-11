import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 60 * 60 * 1000; // 1 Hour

export default {
    data: new SlashCommandBuilder()
        .setName('scavenge')
        .setDescription('High risk, high reward. Scavenge the dangerous wastelands for lost loot!'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastScavenge = userData.lastScavenge || 0;

        // Cooldown Check
        if (now < lastScavenge + COOLDOWN) {
            const remaining = lastScavenge + COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            return InteractionHelper.safeEditReply(interaction, { 
                content: `🚓 **The area is swarming with cops!** Lay low for **${minutes}m** before scavenging again.` 
            });
        }

        // Risk Logic: 35% chance to find massive loot, 65% chance to get caught/robbed
        const isSuccess = Math.random() < 0.35;
        let embed = new EmbedBuilder();

        if (isSuccess) {
            const reward = Math.floor(Math.random() * 4000) + 1000; // $1000 - $5000
            await EconomyService.addMoney(client, guildId, userId, reward, 'Scavenging Loot');
            
            embed.setTitle('🎒 Epic Scavenger Run!')
                .setColor('#2ecc71')
                .setDescription(`You bravely explored the abandoned ruins and found a hidden stash!\n\n**+ $${reward.toLocaleString()}**`)
                .setFooter({ text: 'Risk pays off!' });
        } else {
            const penalty = Math.floor(Math.random() * 800) + 200; // Lose $200 - $1000
            const currentWallet = userData.wallet || 0;
            const actualPenalty = Math.min(penalty, currentWallet); // Can't lose more than they have
            
            await EconomyService.removeMoney(client, guildId, userId, actualPenalty, 'Scavenge Penalty');
            
            embed.setTitle('💀 Scavenge Failed!')
                .setColor('#e74c3c')
                .setDescription(`You got caught by a rival gang while searching the ruins. They beat you up and stole your cash.\n\n**- $${actualPenalty.toLocaleString()}**`)
                .setFooter({ text: 'Better luck next time.' });
        }

        userData.lastScavenge = now;
        await setEconomyData(client, guildId, userId, userData);
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
