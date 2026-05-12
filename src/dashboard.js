import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';
import { getGuildConfig, updateGuildConfig } from './services/guildConfig.js';

export function attachDashboard(app, client) {
    const dashboard = express.Router();

    // 🔒 SECURITY: Change these credentials!
    dashboard.use(basicAuth({
        users: { 'admin': 'supersecretpassword123' }, 
        challenge: true,
        unauthorizedResponse: '❌ Unauthorized Access. Admins only.'
    }));

    dashboard.use(express.urlencoded({ extended: true }));

    // --- HTML TEMPLATE WRAPPER ---
    const renderPage = (title, content, activeTab) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} | Chaos Control OS</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700;900&display=swap" rel="stylesheet">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body { font-family: 'Outfit', sans-serif; background-color: #050505; color: #e2e8f0; }
                .glass-card { background: linear-gradient(145deg, rgba(30,30,40,0.8) 0%, rgba(20,20,25,0.8) 100%); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
                .gradient-text { background: linear-gradient(to right, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #050505; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
            </style>
        </head>
        <body class="flex h-screen overflow-hidden selection:bg-fuchsia-500 selection:text-white">
            
            <aside class="w-72 bg-[#0a0a0a] border-r border-white/5 flex flex-col z-20 relative">
                <div class="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-fuchsia-900/10 to-transparent pointer-events-none"></div>
                <div class="p-8 border-b border-white/5 flex flex-col items-center justify-center relative z-10">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] mb-4">
                        <i class="fa-solid fa-bolt text-3xl text-white"></i>
                    </div>
                    <h1 class="text-2xl font-black tracking-widest text-white uppercase">CHAOS<span class="text-fuchsia-500">OS</span></h1>
                    <div class="flex items-center gap-2 mt-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span class="text-xs font-semibold text-green-400 uppercase tracking-wider">System Online</span>
                    </div>
                </div>
                
                <nav class="flex-1 p-4 space-y-2 relative z-10 mt-4">
                    <p class="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Main Menu</p>
                    <a href="/admin" class="flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeTab === 'home' ? 'bg-white/10 text-white shadow-inner border border-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white'}">
                        <i class="fa-solid fa-chart-line w-5 text-center ${activeTab === 'home' ? 'text-fuchsia-400' : ''}"></i> Overview
                    </a>
                    <a href="/admin#config" class="flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeTab === 'config' ? 'bg-white/10 text-white shadow-inner border border-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white'}">
                        <i class="fa-solid fa-sliders w-5 text-center ${activeTab === 'config' ? 'text-blue-400' : ''}"></i> Server Config
                    </a>
                    <a href="/admin#economy" class="flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeTab === 'economy' ? 'bg-white/10 text-white shadow-inner border border-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white'}">
                        <i class="fa-solid fa-coins w-5 text-center ${activeTab === 'economy' ? 'text-yellow-400' : ''}"></i> Economy Banker
                    </a>
                </nav>
            </aside>

            <main class="flex-1 overflow-y-auto relative bg-[#050505]">
                <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-fuchsia-900/20 blur-[120px] rounded-full pointer-events-none"></div>
                <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none"></div>
                
                <div class="max-w-7xl mx-auto p-10 relative z-10">
                    <header class="flex justify-between items-end mb-12">
                        <div>
                            <h2 class="text-4xl font-black text-white mb-2 tracking-tight">${title}</h2>
                            <p class="text-gray-400 text-lg">Manage your Discord infrastructure from the cloud.</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold text-gray-500 uppercase tracking-widest">Bot Ping</p>
                            <p class="text-3xl font-black gradient-text">${client.ws.ping}ms</p>
                        </div>
                    </header>
                    ${content}
                </div>
            </main>
        </body>
        </html>
    `;

    // 🏠 MAIN DASHBOARD PAGE
    dashboard.get('/', (req, res) => {
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const uptimeHours = (client.uptime / 3600000).toFixed(2);

        const content = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <div class="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl transition-all"></div>
                    <div class="flex justify-between items-center mb-4">
                        <div class="p-3 bg-blue-500/20 rounded-xl text-blue-400"><i class="fa-solid fa-server text-xl"></i></div>
                        <span class="text-green-400 text-sm font-bold bg-green-400/10 px-2 py-1 rounded-md">+ Active</span>
                    </div>
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Servers</p>
                    <h3 class="text-4xl font-black text-white">${client.guilds.cache.size}</h3>
                </div>
                
                <div class="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/10 rounded-full blur-2xl transition-all"></div>
                    <div class="flex justify-between items-center mb-4">
                        <div class="p-3 bg-fuchsia-500/20 rounded-xl text-fuchsia-400"><i class="fa-solid fa-users text-xl"></i></div>
                    </div>
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Members</p>
                    <h3 class="text-4xl font-black text-white">${totalUsers.toLocaleString()}</h3>
                </div>

                <div class="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl transition-all"></div>
                    <div class="flex justify-between items-center mb-4">
                        <div class="p-3 bg-amber-500/20 rounded-xl text-amber-400"><i class="fa-solid fa-clock text-xl"></i></div>
                    </div>
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Uptime</p>
                    <h3 class="text-4xl font-black text-white">${uptimeHours} <span class="text-xl text-gray-500 font-medium">hrs</span></h3>
                </div>

                <div class="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl transition-all"></div>
                    <div class="flex justify-between items-center mb-4">
                        <div class="p-3 bg-rose-500/20 rounded-xl text-rose-400"><i class="fa-solid fa-microchip text-xl"></i></div>
                    </div>
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Memory Usage</p>
                    <h3 class="text-4xl font-black text-white">${ramUsage} <span class="text-xl text-gray-500 font-medium">MB</span></h3>
                </div>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
                
                <div id="config" class="glass-card rounded-3xl p-8 border-t-4 border-t-blue-500 relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 text-9xl text-white/5 pointer-events-none"><i class="fa-solid fa-sliders"></i></div>
                    <div class="flex items-center gap-4 mb-6 relative z-10">
                        <div class="bg-blue-500 text-white w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-blue-500/30"><i class="fa-solid fa-gear"></i></div>
                        <div>
                            <h2 class="text-2xl font-black text-white">Server Configuration</h2>
                            <p class="text-gray-400 text-sm">Setup Welcome, Goodbye, and Logging channels.</p>
                        </div>
                    </div>
                    
                    <form action="server" method="GET" class="relative z-10">
                        <div class="bg-black/50 border border-white/10 rounded-2xl p-6 mb-6">
                            <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Target Discord Server ID</label>
                            <div class="relative">
                                <i class="fa-solid fa-hashtag absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                                <input type="text" name="guildId" placeholder="e.g. 123456789012345678" required class="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all">
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-3 text-lg">
                            Configure Server <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </form>
                </div>

                <div id="economy" class="glass-card rounded-3xl p-8 border-t-4 border-t-yellow-500 relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 text-9xl text-white/5 pointer-events-none"><i class="fa-solid fa-coins"></i></div>
                    <div class="flex items-center gap-4 mb-6 relative z-10">
                        <div class="bg-yellow-500 text-black w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-yellow-500/30"><i class="fa-solid fa-magnifying-glass-dollar"></i></div>
                        <div>
                            <h2 class="text-2xl font-black text-white">Economy Banker</h2>
                            <p class="text-gray-400 text-sm">Look up a player to view or override their casino balance.</p>
                        </div>
                    </div>
                    
                    <form action="user" method="GET" class="relative z-10">
                        <div class="bg-black/50 border border-white/10 rounded-2xl p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">User ID</label>
                                <div class="relative">
                                    <i class="fa-solid fa-user absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                                    <input type="text" name="userId" placeholder="User ID" required class="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-4 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 transition-all">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Server ID</label>
                                <div class="relative">
                                    <i class="fa-solid fa-server absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                                    <input type="text" name="guildId" placeholder="Server ID" required class="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-4 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 transition-all">
                                </div>
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 px-8 rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all flex items-center justify-center gap-3 text-lg">
                            Access Vault <i class="fa-solid fa-vault"></i>
                        </button>
                    </form>
                </div>
            </div>

            <div class="glass-card rounded-3xl p-8 border border-white/5">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-white"><i class="fa-solid fa-chart-area mr-2 text-fuchsia-500"></i> Network Activity</h2>
                    <span class="bg-white/10 text-gray-300 text-xs px-3 py-1 rounded-full border border-white/10">Last 7 Days</span>
                </div>
                <div class="h-64 w-full">
                    <canvas id="activityChart"></canvas>
                </div>
            </div>

            <script>
                const ctx = document.getElementById('activityChart').getContext('2d');
                let gradient = ctx.createLinearGradient(0, 0, 0, 400);
                gradient.addColorStop(0, 'rgba(168, 85, 247, 0.5)'); 
                gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        datasets: [{
                            label: 'Commands Processed',
                            data: [1200, 1900, 1500, 2200, 1800, 2800, 3100],
                            borderColor: '#a855f7', backgroundColor: gradient, borderWidth: 3,
                            pointBackgroundColor: '#fff', pointBorderColor: '#a855f7',
                            pointBorderWidth: 2, pointRadius: 4, fill: true, tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                        scales: {
                            y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
                            x: { grid: { display: false }, ticks: { color: '#64748b' } }
                        }
                    }
                });
            </script>
        `;
        res.send(renderPage('Command Center', content, 'home'));
    });

    // ⚙️ SERVER CONFIGURATION PAGE
    dashboard.get('/server', async (req, res) => {
        const { guildId, success, msg } = req.query;
        
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) throw new Error("Guild not found in cache.");

            const config = await getGuildConfig(client, guildId);
            
            // Get text channels for dropdowns (Type 0 is Text Channel)
            const textChannels = guild.channels.cache
                .filter(c => c.type === 0) 
                .map(c => ({ id: c.id, name: c.name }));

            let alertHtml = '';
            if (success === 'true') {
                alertHtml = `<div class="bg-green-500/20 border border-green-500/50 text-green-400 px-5 py-4 rounded-xl mb-8 flex items-center gap-3 font-bold"><i class="fa-solid fa-circle-check text-xl"></i> ${msg}</div>`;
            }

            const generateOptions = (selectedId) => {
                let options = \`<option value="" class="bg-slate-900 text-gray-400">-- Select a Channel --</option>\`;
                textChannels.forEach(c => {
                    const selected = c.id === selectedId ? 'selected' : '';
                    options += \`<option value="\${c.id}" class="bg-slate-900 text-white" \${selected}># \${c.name}</option>\`;
                });
                return options;
            };

            const content = `
                <a href="/admin" class="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/5">
                    <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
                </a>

                ${alertHtml}

                <div class="glass-card rounded-3xl p-8 border-t-4 border-t-blue-500 relative overflow-hidden">
                    <div class="absolute right-0 top-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div class="flex items-center gap-6 mb-10 relative z-10 border-b border-white/10 pb-8">
                        ${guild.iconURL() ? `<img src="${guild.iconURL({ size: 128 })}" class="w-24 h-24 rounded-2xl shadow-xl border border-white/20">` : `<div class="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-bold text-gray-500 border border-white/20">${guild.name.charAt(0)}</div>`}
                        <div>
                            <h2 class="text-4xl font-black text-white mb-2">${guild.name}</h2>
                            <div class="flex gap-4 text-sm font-medium text-gray-400">
                                <span class="bg-white/5 px-3 py-1 rounded-md border border-white/10"><i class="fa-solid fa-hashtag mr-1"></i> ${guildId}</span>
                                <span class="bg-white/5 px-3 py-1 rounded-md border border-white/10"><i class="fa-solid fa-users mr-1"></i> ${guild.memberCount} Members</span>
                            </div>
                        </div>
                    </div>

                    <form action="edit-server" method="POST" class="relative z-10 space-y-8">
                        <input type="hidden" name="guildId" value="${guildId}">

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="bg-black/40 rounded-2xl p-6 border border-white/5 relative overflow-hidden group">
                                <div class="absolute left-0 top-0 w-1 h-full bg-green-500"></div>
                                <h3 class="text-xl font-bold text-white mb-2 flex items-center gap-3"><i class="fa-solid fa-door-open text-green-400"></i> Welcome System</h3>
                                <p class="text-gray-400 text-sm mb-5">Select the channel where greeting messages are sent.</p>
                                
                                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Welcome Channel</label>
                                <select name="welcomeChannel" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all appearance-none cursor-pointer">
                                    ${generateOptions(config.welcomeChannel)}
                                </select>
                            </div>

                            <div class="bg-black/40 rounded-2xl p-6 border border-white/5 relative overflow-hidden group">
                                <div class="absolute left-0 top-0 w-1 h-full bg-rose-500"></div>
                                <h3 class="text-xl font-bold text-white mb-2 flex items-center gap-3"><i class="fa-solid fa-door-closed text-rose-400"></i> Goodbye System</h3>
                                <p class="text-gray-400 text-sm mb-5">Select the channel for departure messages.</p>
                                
                                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Goodbye Channel</label>
                                <select name="goodbyeChannel" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all appearance-none cursor-pointer">
                                    ${generateOptions(config.goodbyeChannel)}
                                </select>
                            </div>
                            
                            <div class="bg-black/40 rounded-2xl p-6 border border-white/5 relative overflow-hidden group lg:col-span-2">
                                <div class="absolute left-0 top-0 w-1 h-full bg-purple-500"></div>
                                <h3 class="text-xl font-bold text-white mb-2 flex items-center gap-3"><i class="fa-solid fa-clipboard-list text-purple-400"></i> Server Action Logs</h3>
                                <p class="text-gray-400 text-sm mb-5">Select the channel for moderation and server logs.</p>
                                
                                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Logging Channel</label>
                                <select name="logChannel" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none cursor-pointer">
                                    ${generateOptions(config.logChannel)}
                                </select>
                            </div>
                        </div>
                        
                        <div class="flex justify-end pt-6 border-t border-white/10">
                            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all flex items-center gap-3 text-lg">
                                <i class="fa-solid fa-floppy-disk"></i> Save Configuration
                            </button>
                        </div>
                    </form>
                </div>
            `;
            res.send(renderPage(`Config: ${guild.name}`, content, 'config'));
        } catch (error) {
            console.error(error);
            res.send(renderPage('Error', `<div class="bg-rose-500/10 border border-rose-500/30 p-8 rounded-3xl text-center max-w-lg mx-auto mt-20"><i class="fa-solid fa-triangle-exclamation text-6xl text-rose-500 mb-6"></i><h2 class="text-3xl font-black text-white mb-3">Server Not Found</h2><p class="text-gray-400 mb-8">Make sure the Bot is actually inside the server you are trying to configure, and that the ID is correct.</p><a href="/admin" class="bg-white/10 hover:bg-white/20 py-3 px-8 rounded-xl text-white font-bold transition-all border border-white/5">Return Home</a></div>`, 'config'));
        }
    });

    // ⚡ ACTION: EDIT SERVER (POST ROUTE)
    dashboard.post('/edit-server', async (req, res) => {
        const { guildId, welcomeChannel, goodbyeChannel, logChannel } = req.body;
        try {
            await updateGuildConfig(client, guildId, { 
                welcomeChannel: welcomeChannel || null, 
                goodbyeChannel: goodbyeChannel || null,
                logChannel: logChannel || null
            });
            const msg = encodeURIComponent(`Server configurations updated successfully!`);
            res.redirect(`server?guildId=${guildId}&success=true&msg=${msg}`);
        } catch (error) {
            res.send("Error updating server configuration.");
        }
    });

    // 🔍 USER PROFILE & BANKER CONTROLS
    dashboard.get('/user', async (req, res) => {
        const { userId, guildId, success, msg } = req.query;
        
        try {
            const userData = await getEconomyData(client, guildId, userId);
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.username : 'Unknown User';
            const avatarUrl = user ? user.displayAvatarURL({ extension: 'png', size: 256 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const wallet = userData.wallet || 0;
            const bank = userData.bank || 0;

            let alertHtml = '';
            if (success === 'true') {
                alertHtml = `<div class="bg-green-500/20 border border-green-500/50 text-green-400 px-5 py-4 rounded-xl mb-8 flex items-center gap-3 font-bold"><i class="fa-solid fa-circle-check text-xl"></i> ${msg}</div>`;
            }

            const content = `
                <a href="/admin" class="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/5">
                    <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
                </a>
                ${alertHtml}
                
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="glass-card rounded-3xl p-8 flex flex-col items-center text-center relative overflow-hidden">
                        <div class="absolute top-0 w-full h-32 bg-gradient-to-b from-yellow-500/20 to-transparent"></div>
                        <img src="${avatarUrl}" class="w-36 h-36 rounded-full border-4 border-[#050505] shadow-2xl mb-6 relative z-10">
                        <h2 class="text-3xl font-black text-white mb-1 relative z-10">${username}</h2>
                        <p class="text-gray-500 font-mono text-xs mb-8 relative z-10 bg-white/5 px-3 py-1 rounded-md border border-white/5">${userId}</p>
                        
                        <div class="w-full bg-black/40 rounded-2xl p-6 border border-white/5 space-y-4 relative z-10">
                            <div class="flex justify-between items-center"><span class="text-gray-400 font-bold uppercase tracking-wider text-xs">👛 Wallet</span><span class="text-white font-black text-lg">$${wallet.toLocaleString()}</span></div>
                            <div class="flex justify-between items-center"><span class="text-gray-400 font-bold uppercase tracking-wider text-xs">🏛️ Bank</span><span class="text-white font-black text-lg">$${bank.toLocaleString()}</span></div>
                            <div class="h-px bg-white/10 w-full my-4"></div>
                            <div class="flex justify-between items-center bg-yellow-500/10 -mx-4 -my-2 p-4 rounded-xl border border-yellow-500/20">
                                <span class="text-yellow-500 font-bold uppercase tracking-wider text-sm">💎 Net Worth</span>
                                <span class="text-yellow-400 font-black text-xl">$${(wallet + bank).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-2 glass-card rounded-3xl p-8 border-t-4 border-t-yellow-500 relative overflow-hidden">
                        <div class="absolute right-0 top-0 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <h2 class="text-2xl font-black text-white mb-2 flex items-center gap-3 relative z-10"><i class="fa-solid fa-building-columns text-yellow-500"></i> Central Vault Override</h2>
                        <p class="text-gray-400 text-sm mb-10 relative z-10">Directly modify this user's economy database. Changes are applied instantly.</p>

                        <form action="edit-balance" method="POST" class="space-y-8 relative z-10">
                            <input type="hidden" name="userId" value="${userId}">
                            <input type="hidden" name="guildId" value="${guildId}">

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div class="bg-black/30 p-5 rounded-2xl border border-white/5">
                                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Action</label>
                                    <div class="relative">
                                        <select name="action" class="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 appearance-none cursor-pointer">
                                            <option value="add" class="bg-slate-900">➕ Add Cash</option>
                                            <option value="remove" class="bg-slate-900">➖ Deduct Cash</option>
                                            <option value="set" class="bg-slate-900">✏️ Set Exact Balance</option>
                                        </select>
                                        <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none"></i>
                                    </div>
                                </div>
                                <div class="bg-black/30 p-5 rounded-2xl border border-white/5">
                                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Account</label>
                                    <div class="relative">
                                        <select name="account" class="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 appearance-none cursor-pointer">
                                            <option value="wallet" class="bg-slate-900">👛 Wallet (Cash)</option>
                                            <option value="bank" class="bg-slate-900">🏛️ Bank Storage</option>
                                        </select>
                                        <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none"></i>
                                    </div>
                                </div>
                                <div class="bg-black/30 p-5 rounded-2xl border border-white/5">
                                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Amount ($)</label>
                                    <div class="relative">
                                        <i class="fa-solid fa-dollar-sign absolute left-4 top-1/2 transform -translate-y-1/2 text-green-500"></i>
                                        <input type="number" name="amount" min="0" placeholder="0" required class="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 font-mono">
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex justify-end pt-6 border-t border-white/10">
                                <button type="submit" class="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-black py-4 px-10 rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all flex items-center gap-3 text-lg">
                                    <i class="fa-solid fa-triangle-exclamation"></i> Force Override
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            res.send(renderPage(`Player: ${username}`, content, 'economy'));
        } catch (error) {
            res.send(renderPage('Error', `<div class="bg-rose-500/10 border border-rose-500/30 p-8 rounded-3xl text-center max-w-lg mx-auto mt-20"><i class="fa-solid fa-circle-xmark text-6xl text-rose-500 mb-6"></i><h2 class="text-3xl font-black text-white mb-3">Data Not Found</h2><p class="text-gray-400 mb-8">Could not locate economy data. Please verify the Discord User ID and Server ID.</p><a href="/admin" class="bg-white/10 hover:bg-white/20 py-3 px-8 rounded-xl text-white font-bold transition-all border border-white/5">Return Home</a></div>`, 'economy'));
        }
    });

    // ⚡ ACTION: EDIT BALANCE (POST ROUTE)
    dashboard.post('/edit-balance', async (req, res) => {
        const { userId, guildId, action, account, amount } = req.body;
        const numAmount = parseInt(amount);

        try {
            const userData = await getEconomyData(client, guildId, userId);
            let oldBalance = userData[account] || 0;

            if (action === 'add') userData[account] = oldBalance + numAmount;
            else if (action === 'remove') userData[account] = Math.max(0, oldBalance - numAmount);
            else if (action === 'set') userData[account] = numAmount;

            await setEconomyData(client, guildId, userId, userData);
            const msg = encodeURIComponent(`Successfully ${action}ed $${numAmount.toLocaleString()} ${action === 'add' ? 'to' : action === 'remove' ? 'from' : 'in'} their ${account}!`);
            res.redirect(`user?userId=${userId}&guildId=${guildId}&success=true&msg=${msg}`);
        } catch (error) {
            res.send("Error updating database.");
        }
    });

    app.use('/admin', dashboard);
}
