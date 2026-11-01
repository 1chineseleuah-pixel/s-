require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { LavalinkManager } = require("lavalink-client");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Initialize Lavalink Manager with active public node
client.lavalink = new LavalinkManager({
    nodes: [
        {
            host: "lava-v4.ajiedev.id",
            port: 443,
            authorization: "https://discord.gg/ajiedev",
            secure: true
        }
    ],
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: process.env.CLIENT_ID
    }
});

client.on("raw", (packet) => client.lavalink.sendRawPayload(packet));

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.lavalink.init({ id: client.user.id });
});

// Slash Command Handling
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guildId, member } = interaction;

    if (commandName === 'play') {
        const query = options.getString('query');
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel first!', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            let player = client.lavalink.getPlayer(guildId);

            if (!player) {
                player = client.lavalink.createPlayer({
                    guildId: guildId,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                });
                await player.connect();
            }

            const res = await player.search({ query: query }, interaction.user);

            if (!res || !res.tracks.length) {
                return interaction.editReply('❌ No results found for your query.');
            }

            if (res.loadType === "playlist") {
                for (const track of res.tracks) {
                    player.queue.add(track);
                }
                await interaction.editReply(`🎶 Added playlist: **${res.playlist.name}** (${res.tracks.length} tracks)`);
            } else {
                player.queue.add(res.tracks[0]);
                await interaction.editReply(`🎶 Added to queue: **${res.tracks[0].title}**`);
            }

            if (!player.playing && !player.paused) {
                await player.play();
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ An error occurred while trying to play the song.');
        }
    }
});

// Register slash commands to Discord
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song from any major link or search query')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name, YouTube, SoundCloud, or supported audio URL')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.login(process.env.DISCORD_TOKEN);
