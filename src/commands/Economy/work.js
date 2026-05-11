import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import EconomyService from '../../services/economyService.js';

const COOLDOWN = 30 * 60 * 1000; // 30 Minutes

const JOBS = [
    'flipped burgers at McDonald\'s', 'fixed bugs in ChaosBot', 'delivered pizzas', 
    'walked the neighbor\'s dog', 'mined crypto', 'sold lemonade on the corner'
];

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work a shift to earn some honest cash.'),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastWork = userData.lastWork || 0;

        if (now < lastWork + COOLDOWN) {
            const remaining = lastWork + COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            return InteractionHelper.safeEditReply(interaction, { 
                content: `🏢 **Your shift hasn't started yet!** Come back in **${minutes}m ${seconds}s**.` 
            });
        }

        // Base Pay: $300 - $800
        let pay = Math.floor(Math.random() * 500) + 300;
        let bonusText = "";

        // Shop Item Integration: Check for Laptop
        const hasLaptop = (userData.inventory?.['laptop'] || 0) > 0;
        if (hasLaptop) {
            pay = Math.floor(pay * 1.5);
            bonusText = "\n💻 *Your **Laptop** allowed you to work remotely for a 1.5x bonus!*";
        }

        const job = JOBS[Math.floor(Math.random() * JOBS.length)];
        
        await EconomyService.addMoney(client, guildId, userId, pay, 'Work Salary');
        
        userData.lastWork = now;
        await setEconomyData(client, guildId, userId, userData);

        const embed = new EmbedBuilder()
            .setTitle('💼 Shift Completed')
            .setColor('#3498db')
            .setDescription(`You ${job} and earned **$${pay.toLocaleString()}**.${bonusText}`);

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
