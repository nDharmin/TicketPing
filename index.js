require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

// ✅ Create client (IMPORTANT: includes GuildMembers)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Register /setmodrole command
const commands = [
  new SlashCommandBuilder()
    .setName("setmodrole")
    .setDescription("Set the moderator role for ticket notifications")
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Choose the moderator role")
        .setRequired(true)
    )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("✅ Slash commands registered!");
  } catch (error) {
    console.error("❌ Slash command registration failed:", error);
  }
});
// ✅ Load config
let config = {};
if (fs.existsSync("config.json")) {
  config = JSON.parse(fs.readFileSync("config.json"));
} else {
  fs.writeFileSync("config.json", JSON.stringify({}, null, 2));
}

// ✅ Notify Mods Function
async function notifyMods(guild, config, channelName) {
  const guildId = guild.id;

  console.log("📌 Guild ID:", guildId);

  if (!config[guildId]) {
    console.log("❌ No config for this server");
    return;
  }

  const roleId = config[guildId].modRole;

  if (!roleId) {
    console.log("❌ No role set");
    return;
  }

  // 🔥 FETCH ALL MEMBERS (IMPORTANT FIX)
  await guild.members.fetch();

  const role = guild.roles.cache.get(roleId);

  if (!role) {
    console.log("❌ Role not found");
    return;
  }

  console.log("✅ Role:", role.name);
  console.log("👥 Members:", role.members.size);

  role.members.forEach(async (member) => {
    try {
      await member.send(`📩 New ticket created!
📁 Channel: ${channelName}
🔗 Server: ${guild.name}`);
      console.log(`✅ DM sent to ${member.user.tag}`);
    } catch (err) {
      console.log(`❌ Cannot DM ${member.user.tag}`);
    }
  });
}

// ✅ Bot Ready
client.once("ready", () => {
  console.log(`✅ Bot is online: ${client.user.tag}`);

  const guilds = client.guilds.cache;

  console.log(`🌐 Total servers: ${guilds.size}`);
  console.log("📋 Servers where TicketPing is installed:");

  guilds.forEach((guild, index) => {
    console.log(`${index + 1}. ${guild.name} | ID: ${guild.id}`);
  });
});

// Handle /setmodrole command
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setmodrole") {
    const guildId = interaction.guildId;
    const role = interaction.options.getRole("role");

    if (!interaction.memberPermissions.has("ManageRoles")) {
      return interaction.reply({
        content: "❌ You need Manage Roles permission to use this command.",
        ephemeral: true
      });
    }

    if (!config[guildId]) {
      config[guildId] = {};
    }

    config[guildId].modRole = role.id;

    fs.writeFileSync("config.json", JSON.stringify(config, null, 2));

    await interaction.reply({
      content: `✅ Mod role set to ${role.name}`,
      ephemeral: true
    });

    console.log(`✅ Mod role set: ${role.name} in ${interaction.guild.name}`);
  }
});

// 🔥 IMPORTANT: Detect Ticket Tool ticket creation
client.on("channelCreate", (channel) => {
  if (!channel.guild) return;

  console.log("📢 Channel created:", channel.name);

  // detect ticket channels (edit if needed)
  if (channel.name.includes("ticket")) {
    console.log("🎫 Ticket detected!");
    notifyMods(channel.guild, config, channel.name);
  }
});
// ✅ Login
client.login(process.env.TOKEN);
