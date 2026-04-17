require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = 890873781;

// ===== STATES =====
let state = {};
let temp = {};
let activeChats = {};
let adminChatUser = null;
let adminAction = null;

// ================= MENUS =================
function adminMenu(id) {
    bot.sendMessage(id, "👑 Admin Panel", {
        reply_markup: {
            keyboard: [
                ["👥 Users", "📊 Plans"],
                ["💰 Balance", "📜 History"],
                ["🏦 Wallet", "💬 Support"]
            ],
            resize_keyboard: true
        }
    });
}

function userMenu(id) {
    bot.sendMessage(id, "📊 Menu", {
        reply_markup: {
            keyboard: [
                ["💳 Deposit", "💸 Withdraw"],
                ["📜 History", "💬 Support"],
                ["📊 Plans"]
            ],
            resize_keyboard: true
        }
    });
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id;

    if (id === ADMIN_ID) return adminMenu(id);

    db.get("SELECT * FROM users WHERE telegram_id=?", [id], (e, user) => {

        if (!user) {
            state[id] = "name";
            return bot.sendMessage(id, "Enter full name:");
        }

        if (user.approved !== 1)
            return bot.sendMessage(id, "⏳ Await approval");

        bot.sendMessage(id, `👋 Welcome ${user.full_name}`);
        userMenu(id);
    });
});

// ================= CALLBACK =================
bot.on("callback_query", (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    if (data.startsWith("approve_")) {
        const uid = data.split("_")[1];

        db.run("UPDATE users SET approved=1 WHERE telegram_id=?", [uid], () => {
            bot.sendMessage(uid, "✅ Your account has been approved");
            bot.sendMessage(id, "User approved");
        });
    }

    if (data.startsWith("delete_")) {
        const uid = data.split("_")[1];
        db.run("DELETE FROM users WHERE telegram_id=?", [uid]);
        bot.sendMessage(id, "User deleted");
    }

    if (data.startsWith("chat_")) {
        adminChatUser = data.split("_")[1];
        bot.sendMessage(id, `💬 Chat with ${adminChatUser}\nSend message or /end`);
    }

    if (data.startsWith("bal_")) {
        const uid = data.split("_")[1];
        adminAction = { type: "balance", user: uid };
        bot.sendMessage(id, "Send +100 or -50");
    }

    bot.answerCallbackQuery(q.id);
});

// ================= MESSAGE =================
bot.on("message", (msg) => {
    const id = msg.chat.id;
    const text = msg.text;

    // ================= ADMIN =================
    if (id === ADMIN_ID) {

        // USERS
        if (text === "👥 Users") {
            db.all("SELECT * FROM users", [], (e, rows) => {

                if (!rows.length)
                    return bot.sendMessage(id, "No users");

                rows.forEach(u => {
                    bot.sendMessage(id,
`👤 ${u.full_name}
Email: ${u.email || "N/A"}
ID: ${u.telegram_id}
Country: ${u.country}
Location: ${u.location}
Balance: $${u.balance}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "Approve", callback_data: `approve_${u.telegram_id}` },
                                { text: "Delete", callback_data: `delete_${u.telegram_id}` },
                                { text: "Chat", callback_data: `chat_${u.telegram_id}` }
                            ]]
                        }
                    });
                });
            });
            return;
        }

        // WALLET
        if (text === "🏦 Wallet") {
            state[id] = "wallet";
            return bot.sendMessage(id, "Send wallet address:");
        }

        if (state[id] === "wallet") {
            db.run("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)",
                ["wallet", text]);
            state[id] = null;
            return bot.sendMessage(id, "✅ Wallet saved");
        }

        // PLANS
        if (text === "📊 Plans") {
            state[id] = "plan_menu";
            return bot.sendMessage(id,
`1. Add
2. Edit
3. Delete`);
        }

        if (state[id] === "plan_menu") {
            if (text === "1") {
                state[id] = "plan_add";
                return bot.sendMessage(id, "name price target days");
            }
            if (text === "2") {
                state[id] = "plan_edit";
                return bot.sendMessage(id, "id name price target days");
            }
            if (text === "3") {
                state[id] = "plan_delete";
                return bot.sendMessage(id, "id");
            }
        }

        if (state[id] === "plan_add") {
            const [n,p,t,d] = text.split(" ");
            db.run("INSERT INTO plans (name,price,target,days) VALUES (?,?,?,?)",[n,p,t,d]);
            state[id]=null;
            return bot.sendMessage(id,"✅ Plan added");
        }

        if (state[id] === "plan_edit") {
            const [i,n,p,t,d] = text.split(" ");
            db.run("UPDATE plans SET name=?,price=?,target=?,days=? WHERE id=?",[n,p,t,d,i]);
            state[id]=null;
            return bot.sendMessage(id,"✅ Plan updated");
        }

        if (state[id] === "plan_delete") {
            db.run("DELETE FROM plans WHERE id=?", [text]);
            state[id]=null;
            return bot.sendMessage(id,"🗑 Plan deleted");
        }

        // BALANCE
        if (adminAction && adminAction.type === "balance") {
            const amt = parseFloat(text);

            db.run("UPDATE users SET balance = balance + ? WHERE telegram_id=?",
                [amt, adminAction.user]);

            db.run("INSERT INTO deposits (user_id, amount, status) VALUES (?,?,?)",
                [adminAction.user, amt, "admin_adjustment"]);

            adminAction = null;

            return bot.sendMessage(id, "✅ Balance updated");
        }

        // SUPPORT LIST
        if (text === "💬 Support") {
            db.all("SELECT telegram_id FROM users", [], (e, rows) => {

                if (!rows.length)
                    return bot.sendMessage(id, "No users");

                rows.forEach(u => {
                    bot.sendMessage(id, `User ${u.telegram_id}`, {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "Open Chat", callback_data: `chat_${u.telegram_id}` }
                            ]]
                        }
                    });
                });
            });
            return;
        }

        // SUPPORT CHAT
        if (adminChatUser) {
            if (text === "/end") {
                activeChats[adminChatUser] = false;
                adminChatUser = null;
                return bot.sendMessage(id, "❌ Chat ended");
            }

            bot.sendMessage(adminChatUser, `Admin: ${text}`);
            return;
        }
    }

    // ================= USER =================

    // REGISTRATION
    if (state[id] === "name") {
        temp[id] = { name: text };
        state[id] = "email";
        return bot.sendMessage(id, "Enter email:");
    }

    if (state[id] === "email") {
        temp[id].email = text;
        state[id] = "country";
        return bot.sendMessage(id, "Enter country:");
    }

    if (state[id] === "country") {
        temp[id].country = text;
        state[id] = "location";
        return bot.sendMessage(id, "Share location");
    }

    if (msg.location && state[id] === "location") {
        temp[id].location = `${msg.location.latitude},${msg.location.longitude}`;
        state[id] = "id";
        return bot.sendMessage(id, "Upload ID:");
    }

    if (state[id] === "id" && msg.photo) {
        const fileId = msg.photo.pop().file_id;
        const d = temp[id];

        db.run(`INSERT INTO users 
        (telegram_id, full_name, email, country, location, id_photo, approved) 
        VALUES (?,?,?,?,?,?,0)`,
            [id, d.name, d.email, d.country, d.location, fileId]
        );

        state[id] = null;

        bot.sendPhoto(ADMIN_ID, fileId, {
            caption: `New User\nName:${d.name}\nEmail:${d.email}`,
            reply_markup: {
                inline_keyboard: [[
                    { text: "Approve", callback_data: `approve_${id}` },
                    { text: "Delete", callback_data: `delete_${id}` }
                ]]
            }
        });

        return bot.sendMessage(id, "Submitted");
    }

    // DEPOSIT
    if (text === "💳 Deposit") {
        db.get("SELECT value FROM settings WHERE key='wallet'", (e, row) => {
            if (!row) return bot.sendMessage(id, "Wallet not set");
            return bot.sendMessage(id, `Wallet:\n${row.value}`);
        });
    }

    // SUPPORT USER
    if (text === "💬 Support") {
        activeChats[id] = true;
        return bot.sendMessage(ADMIN_ID, `User ${id} needs support`);
    }

    if (activeChats[id]) {
        return bot.sendMessage(ADMIN_ID, `👤 ${id}\n${text}`);
    }

    // VIEW PLANS
    if (text === "📊 Plans") {
        db.all("SELECT * FROM plans", [], (e, rows) => {
            if (!rows.length) return bot.sendMessage(id, "No plans available");

            rows.forEach(p => {
                bot.sendMessage(id,
`📊 ${p.name}
Price: $${p.price}
Target: $${p.target}
Days: ${p.days}`);
            });
        });
    }
});