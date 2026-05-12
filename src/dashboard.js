import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';
import { getGuildConfig, updateGuildConfig } from './services/guildConfig.js';

export function attachDashboard(app, client) {
    const dashboard = express.Router();

    // 🔒 SECURITY
    dashboard.use(basicAuth({
        users: { 'admin': 'supersecretpassword123' }, 
        challenge: true,
        unauthorizedResponse: '❌ Unauthorized Access. Admins only.'
    }));

    dashboard.use(express.urlencoded({ extended: true }));
    dashboard.use(express.json());

    // --- HTML TEMPLATE WRAPPER ---
    const renderPage = (title, content) => `
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
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <style>
                body { font-family: 'Outfit', sans-serif; background-color: #050505; color: #e2e8f0; }
                .glass-card { background: linear-gradient(145deg, rgba(30,30,40,0.8) 0%, rgba(20,20,25,0.8) 100%); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
                .gradient-text { background: linear-gradient(to right, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #050505; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
                .tab-content { display: none; animation: fadeIn 0.3s ease-in-out; }
                .tab-content.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                
                /* Custom Toggle Switch */
                .toggle-checkbox:checked { right: 0; border-color: #a855f7; }
                .toggle-checkbox:checked + .toggle-label { background-color: #a855f7; }
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
                </div>
                
                <nav class="flex-1 p-4 space-y-2 relative z-10 mt-4" id="nav-links">
                    <p class="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Main Menu</p>
                    <button onclick="switchTab('overview')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all bg-white/10 text-white shadow-inner border border-white/5" data-target="overview">
                        <i class="fa-solid fa-chart-line w-5 text-center text-fuchsia-400"></i> Overview
                    </button>
                    <button onclick="switchTab('modules')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="modules">
                        <i class="fa-solid fa-cubes w-5 text-center text-blue-400"></i> Server Modules
                    </button>
                    <button onclick="switchTab('moderation')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="moderation">
                        <i class="fa-solid fa-shield-halved w-5 text-center text-rose-400"></i> Moderation
                    </button>
                    <button onclick="switchTab('economy')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="economy">
                        <i class="fa-solid fa-coins w-5 text-center text-yellow-400"></i> Economy Banker
                    </button>
                </nav>
            </aside>

            <main class="flex-1 overflow-y-auto relative bg-[#050505] p-10">
                <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-fuchsia-900/20 blur-[120px] rounded-full pointer-events-none"></div>
                <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none"></div>
                
                <div class="max-w-7xl mx-auto relative z-10">
                    <header class="flex justify-between items-end mb-12">
                        <div>
                            <h2 class="text-4xl font-black text-white mb-2 tracking-tight" id="page-title">${title}</h2>
                            <p class="text-gray-400 text-lg" id="page-desc">Manage your Discord infrastructure from the cloud.</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold text-gray-500 uppercase tracking-widest">Bot Ping</p>
                            <p class="text-3xl font-black gradient-text">${client.ws.ping}ms</p>
                        </div>
                    </header>
                    
                    ${content}
                </div>
            </main>

            <script>
                function switchTab(tabId) {
                    // Hide all tabs
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                    // Show target
                    document.getElementById('tab-' + tabId).classList.add('active');
                    
                    // Update buttons
                    document.querySelectorAll('.nav-btn').forEach(btn => {
                        btn.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/5');
                        btn.classList.add('text-gray-400');
                    });
                    const activeBtn = document.querySelector(\`.nav-btn[data-target="\${tabId}"]\`);
                    activeBtn.classList.remove('text-gray-400');
                    activeBtn.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/5');

                    // Update Headers
                    const titles = {
                        'overview': { t: 'Command Center', d: 'System status and analytics.' },
                        'modules': { t: 'Server Modules', d: 'Enable and configure core bot features.' },
                        'moderation': { t: 'Security & Moderation', d: 'Manage punishments and security roles.' },
                        'economy': { t: 'Central Reserve', d: 'Manage player balances and casino settings.' }
                    };
                    document.getElementById('page-title').innerText = titles[tabId].t;
                    document.getElementById('page-desc').innerText = titles[tabId].d;
                }

                // Handle Mock Form Submissions with SweetAlert
                document.querySelectorAll('.mock-form').forEach(form => {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        Swal.fire({
                            title: 'Settings Saved!',
                            text: 'The module configuration has been updated in the database.',
                            icon: 'success',
                            background: '#1a1a24',
                            color: '#fff',
                            confirmButtonColor: '#3b82f6'
                        });
                    });
                });
            </script>
        </body>
        </html>
    `;

    // 🏠 MAIN DASHBOARD ROUTE (Serves the entire SPA)
    dashboard.get('/', async (req, res) => {
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const uptimeHours = (client.uptime / 3600000).toFixed(2);

        // Helper to generate module cards
        const generateModuleCard = (icon, color, title, desc, fieldsHtml) => `
            <div class="glass-card rounded-3xl p-6 border-t-4 border-t-${color}-500 relative overflow-hidden flex flex-col h-full">
                <div class="flex justify-between items-start mb-4">
                    <div class="bg-${color}-500/20 text-${color}-400 w-12 h-12 rounded-xl flex items-center justify-center text-xl"><i class="${icon}"></i></div>
                    <div class="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="toggle" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10 top-0 left-0 transition-all duration-300" checked/>
                        <label class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-700 cursor-pointer transition-all duration-300"></label>
                    </div>
                </div>
                <h3 class="text-xl font-bold text-white mb-1">${title}</h3>
                <p class="text-gray-400 text-sm mb-6 flex-grow">${desc}</p>
                <form class="mock-form space-y-3">
                    ${fieldsHtml}
                    <button type="submit" class="w-full mt-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-2 rounded-xl transition-all text-sm">Save Config</button>
                </form>
            </div>
        `;

        const content = `
            <div id="tab-overview" class="tab-content active">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-blue-500/20 rounded-xl text-blue-400"><i class="fa-solid fa-server text-xl"></i></div></div>
                        <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Servers</p>
                        <h3 class="text-4xl font-black text-white">${client.guilds.cache.size}</h3>
                    </div>
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-fuchsia-500/20 rounded-xl text-fuchsia-400"><i class="fa-solid fa-users text-xl"></i></div></div>
                        <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Members</p>
                        <h3 class="text-4xl font-black text-white">${totalUsers.toLocaleString()}</h3>
                    </div>
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-amber-500/20 rounded-xl text-amber-400"><i class="fa-solid fa-clock text-xl"></i></div></div>
                        <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Uptime</p>
                        <h3 class="text-4xl font-black text-white">${uptimeHours} <span class="text-xl text-gray-500 font-medium">hrs</span></h3>
                    </div>
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-rose-500/20 rounded-xl text-rose-400"><i class="fa-solid fa-microchip text-xl"></i></div></div>
                        <p class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Memory Usage</p>
                        <h3 class="text-4xl font-black text-white">${ramUsage} <span class="text-xl text-gray-500 font-medium">MB</span></h3>
                    </div>
                </div>

                <div class="glass-card rounded-3xl p-8 border border-white/5">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-xl font-bold text-white"><i class="fa-solid fa-chart-area mr-2 text-fuchsia-500"></i> Network Activity</h2>
                    </div>
                    <div class="h-64 w-full"><canvas id="activityChart"></canvas></div>
                </div>
                <script>
                    const ctx = document.getElementById('activityChart').getContext('2d');
                    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.5)'); gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
                    new Chart(ctx, { type: 'line', data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ label: 'Commands', data: [1200, 1900, 1500, 2200, 1800, 2800, 3100], borderColor: '#a855f7', backgroundColor: gradient, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
                </script>
            </div>

            <div id="tab-modules" class="tab-content">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${generateModuleCard('fa-solid fa-ticket', 'fuchsia', 'Tickets', 'Manage the support ticket system.', '<input type="text" placeholder="Category ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"> <input type="text" placeholder="Log Channel ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-shield-check', 'green', 'Verification', 'Gate your server behind a verification panel.', '<select class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option>Manual Captcha</option><option>Auto (Account Age)</option></select> <input type="text" placeholder="Verified Role ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-arrow-up-right-dots', 'blue', 'Leveling', 'Reward active members with XP and Roles.', '<input type="text" placeholder="Multiplier (e.g. 1.5x)" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"> <input type="text" placeholder="Level 10 Role ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-door-open', 'rose', 'Welcome/Goodbye', 'Greeting and departure messages.', '<input type="text" placeholder="Welcome Channel ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"> <input type="text" placeholder="Auto Role ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-microphone-lines', 'indigo', 'Join to Create', 'Dynamic voice channel generation.', '<input type="text" placeholder="Master Voice Channel ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-chart-pie', 'emerald', 'Server Stats', 'Live voice channels displaying member counts.', '<input type="text" placeholder="Target Category ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-clipboard-list', 'orange', 'Applications', 'Staff applications and review system.', '<input type="text" placeholder="Review Channel ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-masks-theater', 'purple', 'Reaction Roles', 'Self-assignable role panels.', '<button type="button" class="w-full bg-purple-500/20 text-purple-400 border border-purple-500/50 py-2 rounded-lg text-sm font-bold">Open Role Builder</button>')}
                    ${generateModuleCard('fa-solid fa-gift', 'pink', 'Giveaways', 'Manage server giveaways and rerolls.', '<input type="text" placeholder="Manager Role ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                    ${generateModuleCard('fa-solid fa-cake-candles', 'teal', 'Birthdays', 'Track and announce user birthdays.', '<input type="text" placeholder="Announcement Channel ID" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">')}
                </div>
            </div>

            <div id="tab-moderation" class="tab-content">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    <div class="glass-card rounded-3xl p-8 border-t-4 border-t-rose-500">
                        <h2 class="text-2xl font-black text-white mb-6 flex items-center gap-3"><i class="fa-solid fa-gavel text-rose-500"></i> Quick Punishment</h2>
                        <form class="mock-form space-y-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Target User ID</label>
                                <input type="text" required class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label>
                                    <select class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                                        <option>Ban</option><option>Kick</option><option>Timeout</option><option>Warn</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Duration (Timeout)</label>
                                    <input type="text" placeholder="e.g. 1h, 1d" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Reason</label>
                                <input type="text" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                            </div>
                            <button type="submit" class="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] transition-all">Execute Punishment</button>
                        </form>
                    </div>

                    <div class="space-y-6">
                        <div class="glass-card rounded-3xl p-8 border border-white/5">
                            <h3 class="text-xl font-bold text-white mb-4">🔇 Mute System Setup</h3>
                            <form class="mock-form flex gap-4">
                                <input type="text" placeholder="Mute Role ID" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                                <button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20">Save</button>
                            </form>
                        </div>
                        <div class="glass-card rounded-3xl p-8 border border-white/5">
                            <h3 class="text-xl font-bold text-white mb-4">📜 Audit Logging Setup</h3>
                            <form class="mock-form flex gap-4">
                                <input type="text" placeholder="Log Channel ID" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                                <button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20">Save</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <div id="tab-economy" class="tab-content">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    <div class="glass-card rounded-3xl p-8 border-t-4 border-t-yellow-500">
                        <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-vault text-yellow-500 mr-2"></i> Central Reserve</h2>
                        <form action="/admin/api/economy/edit" method="POST" class="space-y-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">User ID</label><input type="text" name="userId" required class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Guild ID</label><input type="text" name="guildId" required class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label>
                                    <select name="action" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white"><option value="add">Add</option><option value="remove">Remove</option><option value="set">Set Exact</option></select>
                                </div>
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Amount</label><input type="number" name="amount" required class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                            </div>
                            <button type="submit" class="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(202,138,4,0.3)]">Override Balance</button>
                        </form>
                    </div>

                    <div class="space-y-6">
                        <div class="glass-card rounded-3xl p-8 border border-white/5">
                            <h3 class="text-xl font-bold text-white mb-4">🎰 24/7 Roulette Config</h3>
                            <form class="mock-form flex gap-4">
                                <input type="text" placeholder="Roulette Channel ID" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white">
                                <button type="submit" class="bg-green-600 px-6 rounded-xl text-white font-bold hover:bg-green-500">Start Dealer</button>
                            </form>
                        </div>
                        
                        <div class="glass-card rounded-3xl p-8 border border-red-500/30 bg-red-500/5">
                            <h3 class="text-xl font-bold text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Danger Zone</h3>
                            <p class="text-gray-400 text-sm mb-4">Wipe a user's economy profile completely. This cannot be undone.</p>
                            <form class="mock-form flex gap-4">
                                <input type="text" placeholder="User ID to Wipe" class="flex-1 bg-black/50 border border-red-500/50 rounded-xl px-4 py-3 text-white">
                                <button type="submit" class="bg-red-600 px-6 rounded-xl text-white font-bold hover:bg-red-500">WIPE</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
        res.send(renderPage('Command Center', content));
    });

    // ⚡ FUNCTIONAL API: Economy Banker Override
    dashboard.post('/api/economy/edit', async (req, res) => {
        const { userId, guildId, action, amount } = req.body;
        const numAmount = parseInt(amount);

        try {
            const userData = await getEconomyData(client, guildId, userId);
            let oldBalance = userData.wallet || 0;

            if (action === 'add') userData.wallet = oldBalance + numAmount;
            else if (action === 'remove') userData.wallet = Math.max(0, oldBalance - numAmount);
            else if (action === 'set') userData.wallet = numAmount;

            await setEconomyData(client, guildId, userId, userData);
            res.send(`<script>alert('Economy Successfully Updated!'); window.location.href='/admin';</script>`);
        } catch (error) {
            res.send("Error updating database.");
        }
    });

    app.use('/admin', dashboard);
}
