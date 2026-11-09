
require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

// ================================
// EXPRESS SERVER
// ================================

const app = express();

app.get("/", (req, res) => {
  res.send("TicketPing is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

// ================================
// ENCRYPTION SETTINGS
// ================================

const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GITHUB_OWNER = "nDharmin";
const GITHUB_REPO = "TicketPing-Data";
const CONFIG_FILE = "config.enc.json";

if (!ENCRYPTION_KEY || !/^[a-fA-F0-9]{64}$/.test(ENCRYPTION_KEY)) {
  throw new Error("Invalid CONFIG_ENCRYPTION_KEY");
}

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is missing");
}

const encryptionKey = Buffer.from(ENCRYPTION_KEY, "hex");

let config = {};
let configSha = null;

// ================================
// ENCRYPT CONFIGURATION
// ================================

function encryptConfig(data) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    encryptionKey,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex")
  });
}

// ================================
// DECRYPT CONFIGURATION
// ================================

function decryptConfig(encryptedText) {
  const stored = JSON.parse(encryptedText);

  if (
    stored.version !== 1 ||
    stored.algorithm !== "aes-256-gcm"
  ) {
    throw new Error("Unknown encrypted configuration format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(stored.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(stored.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(stored.data, "hex")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

// ================================
// GITHUB API
// ================================

const githubHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
};

const repoUrl =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders,
      ...(options.headers || {})
    }
  });

  return response;
}

// ================================
// SAVE ENCRYPTED CONFIGURATION
// ================================

async function saveConfig(newConfig) {
  const encryptedText = encryptConfig(newConfig);

  const body = {
    message: "Update encrypted TicketPing configuration",
    content: Buffer.from(encryptedText, "utf8").toString("base64")
  };

  if (configSha) {
    body.sha = configSha;
  }

  const response = await githubRequest(
    `${repoUrl}/contents/${CONFIG_FILE}`,
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `GitHub save failed (${response.status}): ${errorText}`
    );
  }

  const result = await response.json();

  configSha = result.content.sha;

  console.log("🔐 Encrypted configuration saved to GitHub!");
}

// ================================
// LOAD ENCRYPTED CONFIGURATION
// ================================

async function loadConfig() {
  // First verify that GitHub repository is accessible.

  const repoResponse = await githubRequest(repoUrl);

  if (!repoResponse.ok) {
    throw new Error(
      `Cannot access TicketPing-Data repository (${repoResponse.status})`
    );
  }

  console.log("✅ Private GitHub repository connected!");

  // Fetch encrypted configuration.

  const response = await githubRequest(
    `${repoUrl}/contents/${CONFIG_FILE}`
  );

  // If the file does not exist, initialize it.

  if (response.status === 404) {
    console.log("📁 No configuration found. Creating a new one.");

    config = {};

    await saveConfig(config);

    return;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub configuration download failed (${response.status})`
    );
  }

  const file = await response.json();

  configSha = file.sha;

  const encryptedText = Buffer.from(
    file.content.replace(/\s/g, ""),
    "base64"
  ).toString("utf8");

  // Decryption errors stop startup rather than resetting data.

  config = decryptConfig(encryptedText);

  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new Error("Invalid configuration data");
  }

  console.log("🔓 Encrypted configuration loaded successfully!");
}

// ================================
// DISCORD CLIENT
// ================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ================================
// SLASH COMMAND REGISTRATION
// ================================

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

const rest = new REST({ version: "10" })
  .setToken(process.env.TOKEN);

// ================================
// BOT READY
// ================================

client.once("clientReady", async () => {
  console.log(`✅ Bot is online: ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ Slash commands registered!");
  } catch (error) {
    console.error("❌ Slash command registration failed:", error);
  }

  const guilds = client.guilds.cache;

  console.log(`🌐 Total servers: ${guilds.size}`);
});

// ================================
// SET MODERATOR ROLE
// ================================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "setmodrole") return;

  try {
    if (!interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageRoles
    )) {
      return interaction.reply({
        content: "❌ You need Manage Roles permission to use this command.",
        flags: 64
      });
    }

    const guildId = interaction.guildId;
    const role = interaction.options.getRole("role");

    // Prepare updated configuration.

    const updatedConfig = {
      ...config,
      [guildId]: {
        ...(config[guildId] || {}),
        modRole: role.id
      }
    };

    // Save encrypted configuration before confirming.

    await saveConfig(updatedConfig);

    config = updatedConfig;

    await interaction.reply({
      content: `✅ Mod role set to ${role.name}`,
      flags: 64
    });

    console.log(
      "✅ Moderator role configuration updated."
    );

  } catch (error) {
    console.error("❌ Could not update moderator role:", error);

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({
        content: "❌ Could not save your moderator role. Please try again.",
        flags: 64
      });
    }

    await interaction.reply({
      content: "❌ Could not save your moderator role. Please try again.",
      flags: 64
    });
  }
});

// ================================
// NOTIFY MODERATORS
// ================================

async function notifyMods(guild, channelName) {
  try {
    const guildId = guild.id;

    console.log("📌 Checking moderator configuration.");

    if (!config[guildId]) {
      console.log("❌ No moderator configuration for this server");
      return;
    }

    const roleId = config[guildId].modRole;

    if (!roleId) {
      console.log("❌ No moderator role configured");
      return;
    }

    await guild.members.fetch();

    const role = guild.roles.cache.get(roleId);

    if (!role) {
      console.log("❌ Moderator role not found");
      return;
    }

    console.log("✅ Moderator role found.");
    console.log("👥 Members:", role.members.size);

    const results = await Promise.allSettled(
      role.members.map(member =>
        member.send(
          `📩 New ticket created!
📁 Channel: ${channelName}
🔗 Server: ${guild.name}`
        )
      )
    );

    results.forEach((result, index) => {
      const member = role.members.at(index);

      if (result.status === "fulfilled") {
        console.log("✅ Moderator notification sent.");
      } else {
        console.log("❌ Could not deliver a moderator notification.");
      }
    });

  } catch (error) {
    console.error("❌ Notification error:", error);
  }
}

// ================================
// DETECT TICKET CREATION
// ================================

client.on("channelCreate", async (channel) => {
  if (!channel.guild) return;

  console.log("📢 A new channel was created.");

  if (channel.name.toLowerCase().includes("ticket")) {
    console.log("🎫 Ticket detected!");

    await notifyMods(channel.guild, channel.name);
  }
});

// ================================
// START BOT SAFELY
// ================================

async function startBot() {
  console.log("🔄 Loading encrypted configuration...");

  await loadConfig();

  console.log("🔐 Configuration ready!");

  await client.login(process.env.TOKEN);
}

startBot().catch(error => {
  console.error("❌ TicketPing startup failed:", error);
  process.exit(1);
});
