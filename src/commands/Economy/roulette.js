import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getBalance, updateBalance } from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play a game of European Roulette with Quick Bet Menus'),
        
    category: 'Economy',
    cooldown: 5,

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const balance = await getBalance(guildId, userId);
        if (balance.wallet < 10) {
            return interaction.reply({ content: '❌ You need at least 10 coins in your wallet to play roulette!', ephemeral: true });
        }

        // Generate Random Hot & Cold Numbers
        const allNumbers = Array.from({length: 37}, (_, i) => i);
        const shuffled = allNumbers.sort(() => 0.5 - Math.random());
        const hotNumbers = shuffled.slice(0, 4).sort((a,b) => a-b);
        const coldNumbers = shuffled.slice(4, 8).sort((a,b) => a-b);

        // Keep the original beautiful embed!
        const embed = new EmbedBuilder()
            .setTitle('🎰 Chaos Casino - Roulette Table')
            .setDescription(`Welcome **${interaction.user.username}**!\nWallet: \`🪙 ${balance.wallet}\`\n\n**Select your bet from the menus below.**\n*A popup will ask for your bet amount.*`)
            .addFields(
                { name: '🔥 Hot Numbers', value: `\`${hotNumbers.join(', ')}\``, inline: true },
                { name: '🧊 Cold Numbers', value: `\`${coldNumbers.join(', ')}\``, inline: true }
            )
            .setColor('#2b2d31')
            .setImage('https://i.imgur.com/3Qyq43r.gif'); // Use your beautiful original table/wheel GIF!

        // Build Dropdowns with ACTUAL Hot/Cold numbers injected
        const row1 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('roulette_outside')
                .setPlaceholder('🔴 Outside Bets (1:1 Payout)')
                .addOptions([
                    { label: 'Red', value: 'red', emoji: '🔴' },
                    { label: 'Black', value: 'black', emoji: '⚫' },
                    { label: 'Even', value: 'even', emoji: '🔢' },
                    { label: 'Odd', value: 'odd', emoji: '🔡' },
                    { label: 'Low (1-18)', value: 'low', emoji: '📉' },
                    { label: 'High (19-36)', value: 'high', emoji: '📈' }
                ])
        );

        const row2 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('roulette_dozcol')
                .setPlaceholder('📊 Dozens & Columns (2:1 Payout)')
                .addOptions([
                    { label: '1st Dozen (1-12)', value: 'dozen1' },
                    { label: '2nd Dozen (13-24)', value: 'dozen2' },
                    { label: '3rd Dozen (25-36)', value: 'dozen3' },
                    { label: '1st Column', value: 'col1' },
                    { label: '2nd Column', value: 'col2' },
                    { label: '3rd Column', value: 'col3' }
                ])
        );

        // Dynamic Hot/Cold Dropdown!
        const row3 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('roulette_hotcold')
                .setPlaceholder('🎯 Specific Numbers (35:1 Payout)')
                .addOptions([
                    { label: 'Zero (0)', value: '0', emoji: '🟢' },
                    ...hotNumbers.map(n => ({ label: `Hot Number: ${n}`, value: `${n}`, emoji: '🔥' })),
                    ...coldNumbers.map(n => ({ label: `Cold Number: ${n}`, value: `${n}`, emoji: '🧊' }))
                ])
        );

        const row4 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('roulette_french')
                .setPlaceholder('🥖 French Call Bets')
                .addOptions([
                    { label: 'Voisins du Zéro', description: '17 numbers near zero. Requires 9 unit bet.', value: 'voisins' },
                    { label: 'Tiers du Cylindre', description: '12 numbers opposite zero. Requires 6 unit bet.', value: 'tiers' },
                    { label: 'Orphelins', description: '8 remaining numbers. Requires 5 unit bet.', value: 'orphelins' }
                ])
        );

        const message = await interaction.reply({
            embeds: [embed],
            components: [row1, row2, row3, row4],
            fetchReply: true
        });

        // The collector waits for them to pick from ANY of the 4 dropdowns
        const filter = i => i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            const selectedBet = i.values[0];
            
            // Pop up the Modal
            const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
            const modal = new ModalBuilder()
                .setCustomId(`roulette_modal_${selectedBet}`)
                .setTitle(`Betting on: ${selectedBet.toUpperCase()}`);

            const betInput = new TextInputBuilder()
                .setCustomId('betAmount')
                .setLabel(`Bet Amount (Max: ${balance.wallet})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(betInput));

            // Show the modal
            await i.showModal(modal);
            
            // Stop listening to dropdowns once they open the modal
            collector.stop('modal_opened');
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: '⏱️ Your time to place a bet expired.', components: [] }).catch(() => null);
            }
        });
    }
};
