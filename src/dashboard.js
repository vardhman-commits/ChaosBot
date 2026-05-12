import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';
import { getGuildConfig, updateGuildConfig } from './services/guildConfig.js';
import { logger } from './utils/logger.js';

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
                .glass-card { background: linear-gradient(145deg, rgba(20,20,25,0.9) 0%, rgba(10,10,15,0.9) 100%); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4); }
                .gradient-text { background: linear-gradient(to right, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #050505; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
                .tab-content { display: none; animation: fadeIn 0.3s ease-in-out; }
                .tab-content.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                
                select { background-color: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 0.75rem center; background-repeat: no-repeat; background-size: 1.2em 1.2em; padding-right: 2.5rem; }
                select:focus { border-color: #a855f7; outline: none; box-shadow: 0 0 10px rgba(168,85,247,0.3); }
                input:focus { border-color: #a855f7; outline: none; box-shadow: 0 0 10px rgba(168,85,247,0.3); }
            </style>
        </head>
        <body class="flex h-screen overflow-hidden selection:bg-fuchsia-500 selection:text-white">
            
            <aside class="w-72 bg-[#09090b] border-r border-white/5 flex flex-col z-20 relative">
                <div class="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-fuchsia-900/10 to-transparent pointer-events-none"></div>
                <div class="p-8 border-b border-white/5 flex flex-col items-center justify-center relative z-10">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-blue-600 flex items-center justify-center shadow-[0_0_25px_rgba(168,85,247,0.4)] mb-4">
                        <i class="fa-solid fa-bolt text-3xl text-white"></i>
                    </div>
                    <h1 class="text-2xl font-black tracking-widest text-white uppercase">CHAOS<span class="text-fuchsia-500">OS</span></h1>
                </div>
                
                <nav class="flex-1 p-4 space-y-2 relative z-10 mt-4 overflow-y-auto" id="nav-links">
                    <p class="px-4 text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Main Menu</p>
                    <button onclick="switchTab('overview')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all bg-white/10 text-white shadow-inner border border-white/5" data-target="overview">
                        <i class="fa-solid fa-chart-pie w-5 text-center text-fuchsia-400"></i> Overview
                    </button>
                    <button onclick="switchTab('core')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="core">
                        <i class="fa-solid fa-sliders w-5 text-center text-blue-400"></i> Core Settings
                    </button>
                    <button onclick="switchTab('modules')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="modules">
                        <i class="fa-solid fa-cubes w-5 text-center text-emerald-400"></i> Server Modules
                    </button>
                    <button onclick="switchTab('economy')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5 hover:text-white" data-target="economy">
                        <i class="fa-solid fa-vault w-5 text-center text-yellow-400"></i> Economy Banker
                    </button>
                </nav>
            </aside>

            <main class="flex-1 overflow-y-auto relative bg-[#050505] p-10">
                <div class="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-fuchsia-900/20 blur-[150px] rounded-full pointer-events-none"></div>
                <div class="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 blur-[150px] rounded-full pointer-events-none"></div>
                
                <div class="max-w-7xl mx-auto relative z-10">
                    <header class="flex justify-between items-end mb-10 border-b border-white/5 pb-6">
                        <div>
                            <h2 class="text-4xl font-black text-white mb-2 tracking-tight" id="page-title">${title}</h2>
                            <p class="text-gray-400 text-lg" id="page-desc">Manage your Discord infrastructure from the cloud.</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Gateway Ping</p>
                            <div class="bg-white/5 px-4 py-2 rounded-lg border border-white/10 flex items-center gap-2">
                                <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <p class="text-xl font-black text-white">${client.ws.ping}ms</p>
                            </div>
                        </div>
                    </header>
                    
                    ${content}
                </div>
            </main>

            <script>
                function switchTab(tabId) {
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                    document.getElementById('tab-' + tabId).classList.add('active');
                    
                    document.querySelectorAll('.nav-btn').forEach(btn => {
                        btn.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/5');
                        btn.classList.add('text-gray-400');
                    });
                    const activeBtn = document.querySelector(\`.nav-btn[data-target="\${tabId}"]\`);
                    activeBtn.classList.remove('text-gray-400');
                    activeBtn.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/5');

                    const titles = {
                        'overview': { t: 'Command Center', d: 'System status and analytics.' },
                        'core': { t: 'Core & Moderation', d: 'Configure base roles and logging infrastructure.' },
                        'modules': { t: 'Server Modules', d: 'Enable and configure interactive bot features.' },
                        'economy': { t: 'Economy Banker', d: 'Manage player balances and casino settings.' }
                    };
                    document.getElementById('page-title').innerText = titles[tabId].t;
                    document.getElementById('page-desc').innerText = titles[tabId].d;
                }

                document.querySelectorAll('.config-form').forEach(form => {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(form);
                        const data = Object.fromEntries(formData.entries());
                        const btn = form.querySelector('button[type="submit"]');
                        const originalText = btn.innerHTML;
                        
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
                        btn.disabled = true;
                        
                        try {
                            const response = await fetch('/admin/api/config/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(data)
                            });
                            
                            if(response.ok) {
                                Swal.fire({ title: 'Config Saved!', text: 'Database updated successfully.', icon: 'success', background: '#09090b', color: '#fff', confirmButtonColor: '#3b82f6', timer: 2000, showConfirmButton: false });
                            } else throw new Error('Save failed');
                        } catch(err) {
                            Swal.fire({ title: 'Error', text: 'Failed to update configuration.', icon: 'error', background: '#09090b', color: '#fff' });
                        } finally {
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                        }
                    });
                });

                // Banker Wipe Logic
                const wipeForm = document.getElementById('wipeForm');
                if(wipeForm) {
                    wipeForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const userId = document.getElementById('wipeUserId').value;
                        const guildId = document.querySelector('#wipeForm input[name="guildId"]').value;

                        const confirm = await Swal.fire({
                            title: 'Are you absolutely sure?',
                            text: "This will permanently delete all of their cash, bank, and items. This cannot be undone!",
                            icon: 'warning',
                            background: '#09090b',
                            color: '#fff',
                            showCancelButton: true,
                            confirmButtonColor: '#dc2626',
                            cancelButtonColor: '#3b82f6',
                            confirmButtonText: 'Yes, annihilate it!'
                        });

                        if (confirm.isConfirmed) {
                            try {
                                const response = await fetch('/admin/api/economy/wipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, guildId }) });
                                if(response.ok) {
                                    Swal.fire({ title: 'Annihilated!', text: 'User data has been reduced to atoms.', icon: 'success', background: '#09090b', color: '#fff' });
                                    document.getElementById('wipeUserId').value = ''; 
                                } else throw new Error('Failed');
                            } catch(err) {
                                Swal.fire({ title: 'Error', text: 'Could not wipe data.', icon: 'error', background: '#09090b', color: '#fff' });
                            }
                        }
                    });
                }
            </script>
        </body>
        </html>
    `;

    // 🏠 MAIN DASHBOARD ROUTE
    dashboard.get('/', async (req, res) => {
        const guild = client.guilds.cache.first();
        if (!guild) return res.send(renderPage("Error", "<h1 class='text-white text-2xl'>Bot is not in any servers! Invite it first.</h1>"));

        const guildId = guild.id;
        const config = await getGuildConfig(client, guildId);

        // Pre-map channels and roles for extremely fast dropdown generation
        const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `# ${c.name}` }));
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `🔊 ${c.name}` }));
        const categories = guild.channels.cache.filter(c => c.type === 4).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `📁 ${c.name}` }));
        const roles = guild.roles.cache.sort((a,b) => b.position - a.position).map(r => ({ id: r.id, label: `@ ${r.name}` }));

        const buildSelect = (name, optionsList, selectedId, placeholder) => {
            let html = `<select name="${name}" class="w-full text-white rounded-xl px-4 py-3 text-sm focus:outline-none transition-all cursor-pointer">`;
            html += `<option value="" class="bg-[#09090b] text-gray-500">-- Select ${placeholder} --</option>`;
            optionsList.forEach(opt => {
                const isSelected = String(opt.id) === String(selectedId) ? 'selected' : '';
                html += `<option value="${opt.id}" class="bg-[#09090b] text-white" ${isSelected}>${opt.label}</option>`;
            });
            return html + `</select>`;
        };

        const buildCard = (icon, color, title, desc, fieldsHtml) => `
            <div class="glass-card rounded-2xl border border-white/5 relative overflow-hidden flex flex-col h-full group hover:border-${color}-500/30 transition-all duration-300">
                <div class="p-6 flex-grow flex flex-col">
                    <div class="flex items-center gap-4 mb-5">
                        <div class="w-12 h-12 rounded-2xl bg-${color}-500/10 text-${color}-400 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(var(--tw-colors-${color}-500),0.1)]">
                            <i class="${icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white leading-tight">${title}</h3>
                            <p class="text-xs text-gray-400">${desc}</p>
                        </div>
                    </div>
                    <form class="config-form flex-grow flex flex-col space-y-3">
                        <input type="hidden" name="guildId" value="${guildId}">
                        ${fieldsHtml}
                        <div class="flex-grow"></div>
                        <button type="submit" class="w-full mt-4 bg-white/5 hover:bg-${color}-500/20 hover:text-${color}-400 border border-white/10 text-white font-bold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2">
                            <i class="fa-solid fa-floppy-disk"></i> Save Data
                        </button>
                    </form>
                </div>
            </div>
        `;

        const content = `
            <div id="tab-overview" class="tab-content active">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-fuchsia-500/20 rounded-xl text-fuchsia-400"><i class="fa-solid fa-users text-xl"></i></div></div>
                        <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Members</p>
                        <h3 class="text-3xl font-black text-white">${guild.memberCount.toLocaleString()}</h3>
                    </div>
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-blue-500/20 rounded-xl text-blue-400"><i class="fa-solid fa-hashtag text-xl"></i></div></div>
                        <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Channels</p>
                        <h3 class="text-3xl font-black text-white">${guild.channels.cache.size}</h3>
                    </div>
                    <div class="glass-card rounded-2xl p-6 relative overflow-hidden">
                        <div class="flex justify-between items-center mb-4"><div class="p-3 bg-rose-500/20 rounded-xl text-rose-400"><i class="fa-solid fa-user-shield text-xl"></i></div></div>
                        <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Roles</p>
                        <h3 class="text-3xl font-black text-white">${guild.roles.cache.size}</h3>
                    </div>
                </div>
            </div>

            <div id="tab-core" class="tab-content">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${buildCard('fa-solid fa-gavel', 'rose', 'Moderation', 'Set primary staff roles and mute functionality.', 
                        buildSelect('adminRole', roles, config.adminRole, 'Admin Role') +
                        buildSelect('modRole', roles, config.modRole, 'Mod Role') +
                        buildSelect('muteRole', roles, config.muteRole, 'Mute Role')
                    )}
                    ${buildCard('fa-solid fa-clipboard-list', 'blue', 'Audit Logging', 'Track server events and user reports.', 
                        buildSelect('logChannelId', textChannels, config.logChannelId, 'Audit Log Channel') +
                        buildSelect('reportChannelId', textChannels, config.reportChannelId, 'User Report Channel')
                    )}
                </div>
            </div>

            <div id="tab-modules" class="tab-content">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${buildCard('fa-solid fa-ticket', 'fuchsia', 'Tickets', 'Manage the support system.', 
                        buildSelect('ticketLogging_lifecycleChannelId', textChannels, config.ticketLogging?.lifecycleChannelId, 'Ticket Log Channel') +
                        buildSelect('ticketLogging_transcriptChannelId', textChannels, config.ticketLogging?.transcriptChannelId, 'Transcripts Channel')
                    )}
                    ${buildCard('fa-solid fa-shield-check', 'emerald', 'Verification', 'Gate your server behind verification.', 
                        buildSelect('verification_roleId', roles, config.verification?.roleId, 'Verified Role') +
                        buildSelect('verification_channelId', textChannels, config.verification?.channelId, 'Verification Channel')
                    )}
                    ${buildCard('fa-solid fa-door-open', 'indigo', 'Welcome', 'Greeting and departure config.', 
                        buildSelect('welcomeChannel', textChannels, config.welcomeChannel, 'Welcome Channel') + 
                        buildSelect('autoRole', roles, config.autoRole, 'Auto-Assign Role')
                    )}
                    ${buildCard('fa-solid fa-cake-candles', 'pink', 'Birthdays', 'Announce user birthdays.', 
                        buildSelect('birthdayChannelId', textChannels, config.birthdayChannelId, 'Birthday Channel')
                    )}
                    ${buildCard('fa-solid fa-microphone-lines', 'cyan', 'Join to Create', 'Dynamic voice generation.', 
                        buildSelect('joinToCreateChannelId', voiceChannels, config.joinToCreateChannelId, 'Master Voice Channel')
                    )}
                    ${buildCard('fa-solid fa-chart-pie', 'orange', 'Server Stats', 'Live voice channel member counts.', 
                        buildSelect('serverStatsCategoryId', categories, config.serverStatsCategoryId, 'Stats Category')
                    )}
                    ${buildCard('fa-solid fa-clipboard-user', 'violet', 'App Admin', 'Manage staff applications.', 
                        buildSelect('appAdminChannelId', textChannels, config.appAdminChannelId, 'App Review Channel')
                    )}
                    ${buildCard('fa-solid fa-gift', 'yellow', 'Giveaways', 'Host server giveaways.', 
                        buildSelect('giveawayManagerRoleId', roles, config.giveawayManagerRoleId, 'Manager Role')
                    )}
                </div>
            </div>

            <div id="tab-economy" class="tab-content">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    <div class="glass-card rounded-3xl p-8 border-t-4 border-t-yellow-500">
                        <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-vault text-yellow-500 mr-2"></i> Central Reserve</h2>
                        <form action="/admin/api/economy/edit" method="POST" class="space-y-4">
                            <input type="hidden" name="guildId" value="${guildId}">
                            <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Target User ID</label><input type="text" name="userId" required class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label>
                                    <select name="action" class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none"><option value="add" class="bg-slate-900">Add</option><option value="remove" class="bg-slate-900">Remove</option><option value="set" class="bg-slate-900">Set Exact</option></select>
                                </div>
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Amount</label><input type="number" name="amount" required class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                            </div>
                            <button type="submit" class="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black py-3 rounded-xl shadow-[0_0_20px_rgba(202,138,4,0.3)] transition-all">Override Balance</button>
                        </form>
                    </div>

                    <div class="space-y-6">
                        <div class="glass-card rounded-3xl p-8 border border-white/5">
                            <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-dharmachakra text-green-500 mr-2"></i> 24/7 Roulette Config</h3>
                            <form class="config-form flex gap-4">
                                <input type="hidden" name="guildId" value="${guildId}">
                                <div class="flex-1">${buildSelect('rouletteChannel', textChannels, config.rouletteChannel, 'Roulette Channel')}</div>
                                <button type="submit" class="bg-green-600 px-6 rounded-xl text-white font-bold hover:bg-green-500 shadow-[0_0_15px_rgba(22,163,74,0.4)] transition-all">Save</button>
                            </form>
                        </div>
                        
                        <div class="glass-card rounded-3xl p-8 border border-red-500/30 bg-red-500/5">
                            <h3 class="text-xl font-bold text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Danger Zone</h3>
                            <p class="text-gray-400 text-sm mb-4">Wipe a user's economy profile completely. This cannot be undone.</p>
                            <form id="wipeForm" class="flex gap-4">
                                <input type="hidden" name="guildId" value="${guildId}">
                                <input type="text" name="userId" id="wipeUserId" required placeholder="User ID to Wipe" class="flex-1 bg-black/60 border border-red-500/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-red-500">
                                <button type="submit" class="bg-red-600 px-6 rounded-xl text-white font-bold hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all">WIPE</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
        res.send(renderPage('Command Center', content));
    });

    // ⚡ API: Universal Config Saver (Handles Nested Data Automatically!)
    dashboard.post('/api/config/update', async (req, res) => {
        try {
            const { guildId, ...settings } = req.body;
            if(!guildId) throw new Error("No guild specified");

            const currentConfig = await getGuildConfig(client, guildId) || {};
            let updates = {};

            for (const [key, value] of Object.entries(settings)) {
                const cleanVal = value === "" ? null : value;
                
                // If it's a nested variable (like verification_roleId)
                if (key.includes('_')) {
                    const [parent, child] = key.split('_');
                    if (!updates[parent]) {
                        // Inherit existing nested data so we don't accidentally wipe it
                        updates[parent] = { ...(currentConfig[parent] || {}) }; 
                    }
                    updates[parent][child] = cleanVal;
                } else {
                    updates[key] = cleanVal;
                }
            }

            await updateGuildConfig(client, guildId, updates);
            res.sendStatus(200);
        } catch (error) {
            logger.error("Dashboard Config Error:", error);
            res.status(500).send("Error updating configuration.");
        }
    });

    // ⚡ API: Economy Banker Override
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

    // ⚡ API: Danger Zone - Wipe Economy Data
    dashboard.post('/api/economy/wipe', async (req, res) => {
        const { userId, guildId } = req.body;
        try {
            await setEconomyData(client, guildId, userId, {
                wallet: 0, bank: 0, bankLevel: 0, 
                xp: 0, level: 1, inventory: {}
            });
            logger.info(`Economy data wiped for user ${userId} in guild ${guildId} via Dashboard.`);
            res.sendStatus(200);
        } catch (error) {
            logger.error("Wipe Error:", error);
            res.status(500).send("Error wiping data.");
        }
    });

    app.use('/admin', dashboard);
}
