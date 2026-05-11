import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 15 * 60 * 1000; // 15 Minutes

const ORES = [
    { name: 'Coal', value: 100, icon: '🪨' },
    { name: 'Iron', value: 250, icon: '🪙' },
    { name: 'Gold', value: 500, icon: '💰' },
    { name: 'Uranium', value: 800, icon: '☢️' }
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Venture into the caves to mine some valuable ores!'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastMine = userData.lastMine || 0;

        if (now < lastMine + COOLDOWN) {
            const remaining = lastMine + COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            return InteractionHelper.safeEditReply(interaction, { 
                content: `⛏️ **You are exhausted!** Rest for **${minutes}m ${seconds}s** before returning to the mines.` 
            });
        }

        // 1. Check for Pickaxes in Inventory
        const hasDiamond = (userData.inventory?.['diamond_pickaxe'] || 0) > 0;
        const hasNormal = (userData.inventory?.['pickaxe'] || 0) > 0;
        
        let multiplier = 1.0;
        let toolUsed = "bare hands";

        if (hasDiamond) {
            multiplier = 2.0;
            toolUsed = "💎 Diamond Pickaxe";
        } else if (hasNormal) {
            multiplier = 1.2;
            toolUsed = "⛏️ Standard Pickaxe";
        }

        // 2. Pick a random ore (weighted)
        const roll = Math.random();
        let minedOre = ORES[0]; // Default Coal
        if (roll > 0.9) minedOre = ORES[3]; // 10% Uranium
        else if (roll > 0.7) minedOre = ORES[2]; // 20% Gold
        else if (roll > 0.4) minedOre = ORES[1]; // 30% Iron

        // 3. Calculate Payout
        const basePayout = minedOre.value + Math.floor(Math.random() * 100);
        const finalPayout = Math.floor(basePayout * multiplier);

        await EconomyService.addMoney(client, guildId, userId, finalPayout, 'Mining Ores');
        userData.lastMine = now;
        await setEconomyData(client, guildId, userId, userData);

        const embed = new EmbedBuilder()
            .setTitle('⛏️ Mining Expedition')
            .setColor(hasDiamond ? '#00cec9' : '#95a5a6')
            .setDescription(`You swung your ${toolUsed} in the dark caves and struck **${minedOre.name}**!\n\n${minedOre.icon} **+ $${finalPayout.toLocaleString()}**`)
            .setFooter({ text: multiplier > 1 ? `Multiplier: ${multiplier}x applied!` : 'Buy a pickaxe in the shop to earn more!' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
