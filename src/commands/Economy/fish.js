import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 20 * 60 * 1000; // 20 Minutes

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Cast your line into the chaotic river and see what bites.'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastFish = userData.lastFish || 0;

        if (now < lastFish + COOLDOWN) {
            const remaining = lastFish + COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            return InteractionHelper.safeEditReply(interaction, { 
                content: `🐟 **The fish are spooked!** Wait **${minutes}m ${seconds}s** before casting your line again.` 
            });
        }

        // Check if they own a fishing rod
        const hasRod = (userData.inventory?.['fishing_rod'] || 0) > 0;
        
        let catchName = "";
        let payout = 0;
        let catchIcon = "🐟";

        if (!hasRod) {
            catchName = "Old Muddy Boot";
            payout = Math.floor(Math.random() * 20) + 10; // $10 - $30
            catchIcon = "🥾";
        } else {
            // They have a rod, run the real fishing loot table
            const roll = Math.random();
            if (roll > 0.95) { catchName = "Golden Koi (JACKPOT!)"; payout = 3000; catchIcon = "🐠"; }
            else if (roll > 0.7) { catchName = "Radioactive Salmon"; payout = 800; catchIcon = "☢️"; }
            else if (roll > 0.4) { catchName = "Fat Tuna"; payout = 400; catchIcon = "🐡"; }
            else { catchName = "Small Bass"; payout = 150; catchIcon = "🐟"; }
        }

        // Apply slight random variance to the payout
        const finalPayout = payout + Math.floor(Math.random() * 50);

        await EconomyService.addMoney(client, guildId, userId, finalPayout, 'Fishing Catch');
        userData.lastFish = now;
        await setEconomyData(client, guildId, userId, userData);

        const embed = new EmbedBuilder()
            .setTitle('🎣 Fishing Trip')
            .setColor('#3498db')
            .setDescription(`You ${hasRod ? 'cast your line' : 'splashed around with your bare hands'} and caught a **${catchName}**!\n\n${catchIcon} **+ $${finalPayout.toLocaleString()}**`)
            .setFooter({ text: hasRod ? 'Good catch!' : 'Buy a Fishing Rod in the shop to catch real fish!' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
