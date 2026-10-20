
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  Events
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

// ================================================
// NAYRP ER:LC — KONFIGURACJA
// ================================================

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    '❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w pliku .env'
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ================================================
// KANAŁY
// ================================================

const CHANNELS = {
  welcome: '1309611300997038085',
  verify: '1309611300997038083',
  proofs: '1309611301667999754',
  verdicts: '1309611301667999757',
  fines: '1561447625935421500',
  wanted: '1309611301667999758',
  ticketPanel: '1309611302091624564',
  praises: '1309611302091624565',
  summons: '1309611302267654236',
  logs: '1309611302674632828',
  roleplay: '1309611301504548966',
  hours: '1309611302540542029',
  leaves: '1309611302674632825'
};

const ROLES = {
  verified: '1309611300535537695',
  ticketStaff: '1309611300556636181',
  authorized: [
    '1309611300543791254',
    '1309611300543791256',
    '1309611300543791258'
  ]
};

const TICKET_CATEGORY_ID = '1560749289066602556';
const CLOSED_CATEGORY_ID = '1560749387720949921';

// ================================================
// KOLORY
// ================================================

const COLORS = {
  main: 0x2471A3,
  success: 0x2ECC71,
  danger: 0xE74C3C,
  warning: 0xF1C40F,
  purple: 0x8E44AD,
  orange: 0xE67E22,
  cyan: 0x00B8D9,
  dark: 0x172033,
  neutral: 0x747F8D
};

// ================================================
// KATEGORIE TICKETÓW
// ================================================

const TICKET_TYPES = {
  zarzad: {
    label: 'Zarząd',
    emoji: '👑',
    description: 'Kontakt z zarządem'
  },
  pomoc: {
    label: 'Pomoc',
    emoji: '🛟',
    description: 'Pytania i problemy'
  },
  blad: {
    label: 'Błąd gry',
    emoji: '🐛',
    description: 'Zgłoszenie błędu w grze'
  },
  skarga: {
    label: 'Skarga na gracza',
    emoji: '🚨',
    description: 'Zgłoszenie niewłaściwego zachowania'
  },
  odwolanie: {
    label: 'Odwołanie od kary',
    emoji: '⚖️',
    description: 'Odwołanie od otrzymanej kary'
  },
  inne: {
    label: 'Inne',
    emoji: '📩',
    description: 'Pozostałe sprawy'
  }
};

// ================================================
// BAZA DANYCH
// ================================================

const DATA_DIR = path.join(__dirname, 'nayrp-data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  fines: [],
  wanted: [],
  verdicts: [],
  proofs: [],
  warns: [],
  praises: [],
  hours: {},
  shifts: {},
  vacations: [],
  tickets: [],
  summons: []
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(
        fs.readFileSync(DB_FILE, 'utf8')
      );

      return {
        ...structuredClone(DEFAULT_DB),
        ...saved
      };
    }
  } catch (error) {
    console.error('❌ Błąd odczytu bazy:', error.message);
  }

  return structuredClone(DEFAULT_DB);
}

const db = loadDB();

function saveDB() {
  const tempFile = `${DB_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(db, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, DB_FILE);
}

for (const key of [
  'fines',
  'wanted',
  'verdicts',
  'proofs',
  'warns',
  'praises',
  'vacations',
  'tickets',
  'summons'
]) {
  if (!Array.isArray(db[key])) db[key] = [];
}

if (!db.hours || typeof db.hours !== 'object') db.hours = {};
if (!db.shifts || typeof db.shifts !== 'object') db.shifts = {};

const verificationChallenges = new Map();

// ================================================
// FUNKCJE POMOCNICZE
// ================================================

function makeEmbed(
  title,
  description,
  color = COLORS.main,
  footer = 'NayRP ER:LC • Oficjalny serwer'
) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer })
    .setTimestamp();
}

function isAuthorized(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    ROLES.authorized.some(id => member?.roles?.cache?.has(id))
  );
}

function isStaff(member) {
  return Boolean(
    isAuthorized(member) ||
    member?.roles?.cache?.has(ROLES.ticketStaff)
  );
}

async function getTextChannel(channelId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(channelId);

    if (!channel?.isTextBased() || !channel.send) return null;

    return channel;
  } catch (error) {
    console.error(
      `❌ Problem z kanałem ${channelId}:`,
      error.message
    );
    return null;
  }
}

async function sendLog(description) {
  const channel = await getTextChannel(CHANNELS.logs);
  if (!channel) return;

  await channel.send({
    embeds: [
      makeEmbed('📋 Dziennik systemowy', description, COLORS.neutral)
    ],
    allowedMentions: { parse: [] }
  }).catch(console.error);
}

async function safeReply(interaction, payload) {
  try {
    const response = typeof payload === 'string'
      ? { content: payload }
      : { ...payload };

    delete response.ephemeral;
    response.allowedMentions = { parse: [] };

    if (interaction.deferred) {
      return await interaction.editReply(response);
    }

    if (interaction.replied) {
      return await interaction.followUp({
        ...response,
        ephemeral: true
      });
    }

    return await interaction.reply({
      ...response,
      ephemeral: true
    });
  } catch (error) {
    console.error('❌ Błąd odpowiedzi:', error.message);
  }
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw'
  }).format(date);
}

function createRecordId(prefix = 'NAY') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function addTextInput(
  modal,
  id,
  label,
  style = TextInputStyle.Short,
  required = true,
  placeholder = '',
  maxLength = 400
) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);

  if (placeholder) input.setPlaceholder(placeholder);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function getModalValue(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

// ================================================
// PANEL ROLEPLAY
// ================================================

function roleplayPanelEmbed() {
  return makeEmbed(
    '🚔 NAYRP • CENTRUM ROLEPLAY',
    [
      'Witamy w **NayRP ER:LC** — miejscu, w którym tworzysz własną historię.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '### 📌 Zasady rozgrywki',
      '・ Dbaj o realizm i kulturę.',
      '・ Przestrzegaj regulaminu serwera.',
      '・ Szanuj pozostałych uczestników sesji.',
      '・ Problemy zgłaszaj administracji.',
      '',
      'Kliknij przycisk, aby poznać podstawowe informacje o roleplay.'
    ].join('\n'),
    COLORS.main,
    'NayRP ER:LC • Centrum rozgrywki'
  );
}

function roleplayPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('roleplay_info')
        .setLabel('Informacje o roleplay')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

// ================================================
// PANEL WERYFIKACJI
// ================================================

function verificationPanelEmbed() {
  return makeEmbed(
    '🛡️ NAYRP • WERYFIKACJA',
    [
      '# Witaj w NayRP ER:LC!',
      '',
      'Aby uzyskać dostęp do serwera, przejdź krótką weryfikację.',
      '',
      '### Jak to zrobić?',
      '1. Kliknij **Rozpocznij weryfikację**.',
      '2. Rozwiąż proste działanie matematyczne.',
      '3. Po poprawnej odpowiedzi otrzymasz rolę zweryfikowanego.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '🔐 Nie udostępniaj danych swojego konta.',
      '',
      '**Powodzenia!**'
    ].join('\n'),
    COLORS.success,
    'NayRP Security • System weryfikacji'
  );
}

function verificationPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_start')
        .setLabel('Rozpocznij weryfikację')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

// ================================================
// PANEL TICKETÓW
// ================================================

function ticketPanelEmbed() {
  return makeEmbed(
    '🎫 NAYRP • CENTRUM ZGŁOSZEŃ',
    [
      'Potrzebujesz pomocy? Otwórz prywatne zgłoszenie.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '👑 **Zarząd** — sprawy zarządu',
      '🛟 **Pomoc** — pytania i problemy',
      '🐛 **Błąd gry** — problemy z rozgrywką',
      '🚨 **Skarga** — zgłoszenie gracza',
      '⚖️ **Odwołanie** — odwołanie od kary',
      '📩 **Inne** — pozostałe sprawy',
      '',
      'Wybierz kategorię z menu poniżej. Kanał będzie widoczny dla Ciebie i obsługi.'
    ].join('\n'),
    COLORS.purple,
    'NayRP Support • Prywatne zgłoszenia'
  );
}

function ticketPanelComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create')
    .setPlaceholder('📂 Wybierz kategorię zgłoszenia')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      Object.entries(TICKET_TYPES).map(([value, type]) => ({
        label: type.label,
        description: type.description,
        value,
        emoji: type.emoji
      }))
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

// ================================================
// PANEL GODZIN
// ================================================

function hoursPanelEmbed() {
  return makeEmbed(
    '🕒 NAYRP • EWIDENCJA SŁUŻBY',
    [
      'Zarządzaj swoją zmianą i sprawdzaj zapisany czas służby.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '📊 **Sprawdź godziny** — zobacz zapisany czas.',
      '▶️ **Rozpocznij zmianę** — zacznij naliczanie.',
      '⏹️ **Zakończ zmianę** — zapisz przepracowany czas.',
      '',
      'Nie zapomnij zakończyć zmiany po skończonej służbie.'
    ].join('\n'),
    COLORS.warning,
    'NayRP Personnel • Ewidencja godzin'
  );
}

function hoursPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hours_check')
        .setLabel('Sprawdź godziny')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('hours_start')
        .setLabel('Rozpocznij zmianę')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('hours_stop')
        .setLabel('Zakończ zmianę')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

// ================================================
// PANELE URLOPÓW, DOWODÓW I PRZYLOTÓW
// ================================================

function vacationPanelEmbed() {
  return makeEmbed(
    '📋 NAYRP • WNIOSKI URLOPOWE',
    'Kliknij przycisk poniżej i podaj dane, daty oraz powód planowanej nieobecności.',
    COLORS.cyan,
    'NayRP Personnel • Urlopy'
  );
}

function vacationPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vacation_start')
        .setLabel('Złóż wniosek urlopowy')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function proofPanelEmbed() {
  return makeEmbed(
    '📄 NAYRP • DOKUMENTACJA POSTACI',
    'Wypełnij formularz, aby przesłać administracji dane swojej postaci do sprawdzenia.',
    COLORS.purple,
    'NayRP ER:LC • Dokumentacja postaci'
  );
}

function proofPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('proof_start')
        .setLabel('Otwórz formularz postaci')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function summonsPanelEmbed() {
  return makeEmbed(
    '🛬 NAYRP • ZGŁOSZENIE PRZYLOTU',
    'Przygotowujesz się do wejścia na serwer? Kliknij przycisk i wypełnij formularz zgłoszenia.',
    COLORS.cyan,
    'NayRP ER:LC • Obsługa przylotów'
  );
}

function summonsPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('summons_start')
        .setLabel('Zgłoś przylot')
        .setEmoji('🛬')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

// ================================================
// KONIEC CZĘŚCI 1/5
// ================================================

// W następnej części dodamy komendy slash oraz formularze.
// Nie dodawaj ponownie require(), konfiguracji ani bazy danych.

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  Events
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w pliku .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const CHANNELS = {
  welcome: '1309611300997038085',
  verify: '1309611300997038083',
  proofs: '1309611301667999754',
  verdicts: '1309611301667999757',
  fines: '1561447625935421500',
  wanted: '1309611301667999758',
  ticketPanel: '1309611302091624564',
  praises: '1309611302091624565',
  summons: '1309611302267654236',
  logs: '1309611302674632828',
  roleplay: '1309611301504548966',
  hours: '1309611302540542029',
  leaves: '1309611302674632825'
};

const ROLES = {
  verified: '1309611300535537695',
  ticketStaff: '1309611300556636181',
  authorized: [
    '1309611300543791254',
    '1309611300543791256',
    '1309611300543791258'
  ]
};

const TICKET_CATEGORY_ID = '1560749289066602556';
const CLOSED_CATEGORY_ID = '1560749387720949921';

const COLORS = {
  main: 0x2471A3,
  success: 0x2ECC71,
  danger: 0xE74C3C,
  warning: 0xF1C40F,
  purple: 0x9B59B6,
  cyan: 0x00B8D9,
  dark: 0x172033,
  neutral: 0x747F8D
};

const TICKET_TYPES = {
  zarzad: {
    label: 'Zarząd',
    emoji: '👑',
    description: 'Kontakt z zarządem'
  },
  pomoc: {
    label: 'Pomoc',
    emoji: '🛟',
    description: 'Pytania i problemy'
  },
  blad: {
    label: 'Błąd gry',
    emoji: '🐛',
    description: 'Zgłoszenie błędu w grze'
  },
  skarga: {
    label: 'Skarga na gracza',
    emoji: '🚨',
    description: 'Zgłoszenie zachowania gracza'
  },
  odwolanie: {
    label: 'Odwołanie od kary',
    emoji: '⚖️',
    description: 'Odwołanie od otrzymanej kary'
  },
  inne: {
    label: 'Inne',
    emoji: '📩',
    description: 'Pozostałe sprawy'
  }
};

const DATA_DIR = path.join(__dirname, 'nayrp-data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  fines: [],
  wanted: [],
  verdicts: [],
  proofs: [],
  warns: [],
  praises: [],
  hours: {},
  shifts: {},
  vacations: [],
  tickets: [],
  summons: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return { ...structuredClone(DEFAULT_DB), ...saved };
    }
  } catch (error) {
    console.error('❌ Błąd odczytu bazy:', error.message);
  }

  return structuredClone(DEFAULT_DB);
}

const db = loadDB();

function saveDB() {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

function makeEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'NayRP ER:LC • Oficjalny system' })
    .setTimestamp();
}

function isAuthorized(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    ROLES.authorized.some(id => member?.roles?.cache?.has(id))
  );
}

function isStaff(member) {
  return Boolean(
    isAuthorized(member) ||
    member?.roles?.cache?.has(ROLES.ticketStaff)
  );
}

async function getTextChannel(channelId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(channelId);

    if (!channel?.isTextBased() || !channel.send) return null;
    return channel;
  } catch (error) {
    console.error(`❌ Błąd kanału ${channelId}:`, error.message);
    return null;
  }
}

async function replyPrivate(interaction, content, embed = null) {
  const payload = {
    ephemeral: true,
    allowedMentions: { parse: [] }
  };

  if (content) payload.content = content;
  if (embed) payload.embeds = [embed];

  try {
    if (interaction.deferred) {
      return await interaction.editReply(payload);
    }

    if (interaction.replied) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error('❌ Błąd odpowiedzi:', error.message);
  }
}

function addTextInput(
  modal,
  id,
  label,
  style = TextInputStyle.Short,
  required = true,
  placeholder = '',
  maxLength = 400
) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);

  if (placeholder) input.setPlaceholder(placeholder);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

/* =========================================================
   CZĘŚĆ 2/4 — PANELE, PRZYCISKI I FORMULARZE
   Wklej na końcu części 1.
========================================================= */

const verificationChallenges = new Map();

function makePanelEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: 'NayRP • ER:LC',
      value: 'Oficjalny system serwera — korzystaj z kanałów zgodnie z ich przeznaczeniem.'
    })
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: 'NayRP ER:LC • System zarządzania' })
    .setTimestamp();
}

function makeButton(customId, label, style = ButtonStyle.Primary, emoji = null) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  if (emoji) button.setEmoji(emoji);

  return button;
}

/* -------------------------
   PANEL WERYFIKACJI
------------------------- */

function buildVerificationPanel() {
  const embed = makePanelEmbed(
    '🔐 Weryfikacja użytkownika',
    [
      'Witaj na **NayRP ER:LC**!',
      '',
      'Aby uzyskać dostęp do serwera, przejdź krótką weryfikację.',
      '',
      '> **Jak to działa?**',
      '1. Kliknij przycisk poniżej.',
      '2. Rozwiąż proste działanie matematyczne.',
      '3. Po poprawnej odpowiedzi otrzymasz rolę zweryfikowanego.',
      '',
      '⚠️ Nie próbuj omijać zabezpieczeń. W razie problemów skontaktuj się z administracją.'
    ].join('\n'),
    COLORS.success
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('verify_start', 'Rozpocznij weryfikację', ButtonStyle.Success, '🔓')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   PANEL TICKETÓW
------------------------- */

function buildTicketPanel() {
  const embed = makePanelEmbed(
    '🎫 Centrum zgłoszeń',
    [
      'Potrzebujesz pomocy administracji? Utwórz zgłoszenie.',
      '',
      '**Dostępne kategorie:**',
      '👑 Zarząd — kontakt z zarządem',
      '🛟 Pomoc — pytania i problemy',
      '🐛 Błąd gry — zgłoszenie błędu',
      '🚨 Skarga na gracza — zgłoszenie sytuacji',
      '⚖️ Odwołanie od kary — odwołanie od decyzji',
      '📩 Inne — pozostałe sprawy',
      '',
      'Wybierz kategorię z listy poniżej. Kanał zgłoszenia będzie widoczny dla Ciebie i uprawnionej administracji.',
      '',
      '📌 **Ważne:** nie twórz kilku zgłoszeń dotyczących tej samej sprawy.'
    ].join('\n'),
    COLORS.purple
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create')
    .setPlaceholder('🎫 Wybierz kategorię zgłoszenia')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      Object.entries(TICKET_TYPES).map(([value, type]) => ({
        label: type.label,
        value,
        description: type.description,
        emoji: type.emoji
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

/* -------------------------
   PANEL GODZIN SŁUŻBY
------------------------- */

function buildHoursPanel() {
  const embed = makePanelEmbed(
    '🕒 Ewidencja służby',
    [
      'W tym panelu możesz kontrolować czas swojej służby.',
      '',
      '🟢 **Rozpocznij służbę** — zapisz godzinę rozpoczęcia.',
      '🔴 **Zakończ służbę** — zapisz zakończenie i oblicz czas.',
      '📊 **Moje godziny** — sprawdź zapisane godziny.',
      '',
      'Pamiętaj, aby zakończyć służbę po jej ukończeniu. Nie rozpoczynaj kilku zmian jednocześnie.'
    ].join('\n'),
    COLORS.cyan
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('hours_start', 'Rozpocznij służbę', ButtonStyle.Success, '🟢'),
    makeButton('hours_stop', 'Zakończ służbę', ButtonStyle.Danger, '🔴'),
    makeButton('hours_check', 'Moje godziny', ButtonStyle.Primary, '📊')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   PANEL URLOPÓW
------------------------- */

function buildVacationPanel() {
  const embed = makePanelEmbed(
    '📅 Wnioski urlopowe',
    [
      'Nie możesz pojawić się na służbie? Złóż wniosek urlopowy.',
      '',
      'W formularzu podaj swoją postać, termin urlopu oraz powód nieobecności.',
      '',
      '📌 Wysłanie wniosku nie oznacza automatycznej akceptacji. Poczekaj na decyzję uprawnionej administracji.'
    ].join('\n'),
    COLORS.warning
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('vacation_start', 'Złóż wniosek', ButtonStyle.Primary, '📝')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   PANEL DOWODÓW
------------------------- */

function buildProofPanel() {
  const embed = makePanelEmbed(
    '📁 Dokumentacja postaci',
    [
      'Tutaj możesz przekazać dokumentację swojej postaci.',
      '',
      'Przygotuj informacje wymagane przez administrację i wypełnij formularz.',
      '',
      'Wpisuj prawdziwe, spójne dane dotyczące swojej postaci. Nie wysyłaj danych osobowych innych użytkowników.'
    ].join('\n'),
    COLORS.main
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('proof_start', 'Prześlij dokumentację', ButtonStyle.Primary, '📄')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   PANEL WEZWAŃ
------------------------- */

function buildSummonsPanel() {
  const embed = makePanelEmbed(
    '📨 Wezwania',
    [
      'Panel obsługi wezwań na NayRP ER:LC.',
      '',
      'Użyj przycisku, aby przygotować wezwanie dotyczące postaci.',
      '',
      'Podaj czytelne informacje i sprawdź formularz przed wysłaniem.'
    ].join('\n'),
    COLORS.purple
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('summons_start', 'Przygotuj wezwanie', ButtonStyle.Primary, '📨')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   PANEL ROLEPLAY
------------------------- */

function buildRoleplayPanel() {
  const embed = makePanelEmbed(
    '🎭 Centrum Roleplay',
    [
      'Witaj w systemie Roleplay serwera **NayRP ER:LC**.',
      '',
      'Korzystaj z komend i kanałów zgodnie z przeznaczeniem.',
      'Informacje związane z rozgrywką trafiają do wyznaczonego kanału Roleplay.',
      '',
      '⚖️ Dbaj o realizm rozgrywki i przestrzegaj regulaminu serwera.'
    ].join('\n'),
    COLORS.cyan
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('roleplay_info', 'Informacje o Roleplay', ButtonStyle.Secondary, 'ℹ️')
  );

  return { embeds: [embed], components: [row] };
}

/* -------------------------
   FORMULARZ WERYFIKACJI
------------------------- */

function buildVerificationModal(question) {
  const modal = new ModalBuilder()
    .setCustomId('verify_answer')
    .setTitle('Weryfikacja NayRP');

  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(`Ile wynosi ${question}?`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Wpisz wynik działania')
    .setRequired(true)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(answer)
  );

  return modal;
}

/* -------------------------
   FORMULARZ URLOPOWY
------------------------- */

function buildVacationModal() {
  const modal = new ModalBuilder()
    .setCustomId('vacation_submit')
    .setTitle('Wniosek urlopowy');

  addTextInput(
    modal,
    'character',
    'Imię i nazwisko postaci',
    TextInputStyle.Short,
    true,
    'Np. Jan Kowalski',
    100
  );

  addTextInput(
    modal,
    'start',
    'Początek urlopu',
    TextInputStyle.Short,
    true,
    'DD.MM.RRRR',
    30
  );

  addTextInput(
    modal,
    'end',
    'Koniec urlopu',
    TextInputStyle.Short,
    true,
    'DD.MM.RRRR',
    30
  );

  addTextInput(
    modal,
    'reason',
    'Powód nieobecności',
    TextInputStyle.Paragraph,
    true,
    'Opisz krótko powód urlopu',
    1000
  );

  return modal;
}

/* -------------------------
   FORMULARZ DOKUMENTACJI
------------------------- */

function buildProofModal() {
  const modal = new ModalBuilder()
    .setCustomId('proof_submit')
    .setTitle('Dokumentacja postaci');

  addTextInput(
    modal,
    'name',
    'Imię i nazwisko postaci',
    TextInputStyle.Short,
    true,
    'Imię i nazwisko',
    100
  );

  addTextInput(
    modal,
    'birth',
    'Data urodzenia postaci',
    TextInputStyle.Short,
    true,
    'DD.MM.RRRR',
    30
  );

  addTextInput(
    modal,
    'idea',
    'Opis postaci i jej historia',
    TextInputStyle.Paragraph,
    true,
    'Opisz swoją postać',
    1000
  );

  return modal;
}

/* -------------------------
   FORMULARZ WEZWANIA
------------------------- */

function buildSummonsModal() {
  const modal = new ModalBuilder()
    .setCustomId('summons_submit')
    .setTitle('Przygotowanie wezwania');

  addTextInput(
    modal,
    'character',
    'Imię i nazwisko postaci',
    TextInputStyle.Short,
    true,
    'Dane postaci',
    100
  );

  addTextInput(
    modal,
    'arrival',
    'Termin stawiennictwa',
    TextInputStyle.Short,
    true,
    'Data i godzina',
    100
  );

  addTextInput(
    modal,
    'details',
    'Powód wezwania',
    TextInputStyle.Paragraph,
    true,
    'Podaj powód wezwania',
    1000
  );

  return modal;
}

/* -------------------------
   WYSYŁANIE PANELI
------------------------- */

async function sendPanelToChannel(channelId, payload) {
  const channel = await getTextChannel(channelId);

  if (!channel) {
    throw new Error(`Nie znaleziono kanału tekstowego ${channelId}`);
  }

  return channel.send({
    ...payload,
    allowedMentions: { parse: [] }
  });
}

async function publishVerificationPanel() {
  return sendPanelToChannel(
    CHANNELS.verify,
    buildVerificationPanel()
  );
}

async function publishTicketPanel() {
  return sendPanelToChannel(
    CHANNELS.ticketPanel,
    buildTicketPanel()
  );
}

async function publishHoursPanel() {
  return sendPanelToChannel(
    CHANNELS.hours,
    buildHoursPanel()
  );
}

async function publishVacationPanel() {
  return sendPanelToChannel(
    CHANNELS.leaves,
    buildVacationPanel()
  );
}

async function publishProofPanel() {
  return sendPanelToChannel(
    CHANNELS.proofs,
    buildProofPanel()
  );
}

async function publishSummonsPanel() {
  return sendPanelToChannel(
    CHANNELS.summons,
    buildSummonsPanel()
  );
}

async function publishRoleplayPanel() {
  return sendPanelToChannel(
    CHANNELS.roleplay,
    buildRoleplayPanel()
  );
}

/* =========================================================
   CZĘŚĆ 3/4 — KOMENDY SLASH
   Wklej na końcu części 2.
========================================================= */

const commands = [
  new SlashCommandBuilder()
    .setName('panele')
    .setDescription('Publikuje panele systemowe NayRP')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('weryfikacja')
    .setDescription('Publikuje panel weryfikacji')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Publikuje panel zgłoszeń')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('godziny-panel')
    .setDescription('Publikuje panel ewidencji służby')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('urlop-panel')
    .setDescription('Publikuje panel wniosków urlopowych')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('dowody-panel')
    .setDescription('Publikuje panel dokumentacji postaci')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('wezwania-panel')
    .setDescription('Publikuje panel wezwań')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('roleplay-panel')
    .setDescription('Publikuje panel Roleplay')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('roleplay')
    .setDescription('Wysyła wpis Roleplay na wyznaczony kanał')
    .addStringOption(option =>
      option.setName('tytul')
        .setDescription('Tytuł wpisu')
        .setRequired(true)
        .setMaxLength(100))
    .addStringOption(option =>
      option.setName('opis')
        .setDescription('Treść wpisu Roleplay')
        .setRequired(true)
        .setMaxLength(2000)),

  new SlashCommandBuilder()
    .setName('godziny')
    .setDescription('Sprawdza zapisane godziny służby')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba, której godziny chcesz sprawdzić')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('pochwala')
    .setDescription('Wystawia pochwałę użytkownikowi')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba otrzymująca pochwałę')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('powod')
        .setDescription('Powód pochwały')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('mandat')
    .setDescription('Wystawia mandat')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba otrzymująca mandat')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('powod')
        .setDescription('Powód mandatu')
        .setRequired(true)
        .setMaxLength(1000))
    .addIntegerOption(option =>
      option.setName('kwota')
        .setDescription('Kwota mandatu')
        .setMinValue(1)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('wyrok')
    .setDescription('Dodaje wpis o wyroku')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba, której dotyczy wyrok')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('powod')
        .setDescription('Opis wyroku')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('poszukiwany')
    .setDescription('Dodaje osobę do listy poszukiwanych')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba poszukiwana')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('powod')
        .setDescription('Powód poszukiwania')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('ostrzezenie')
    .setDescription('Dodaje ostrzeżenie użytkownikowi')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Osoba otrzymująca ostrzeżenie')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('powod')
        .setDescription('Powód ostrzeżenia')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('urlop')
    .setDescription('Otwiera formularz wniosku urlopowego'),

  new SlashCommandBuilder()
    .setName('ticket-dodaj')
    .setDescription('Dodaje użytkownika do aktualnego ticketu')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Użytkownik do dodania')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-usun')
    .setDescription('Usuwa użytkownika z aktualnego ticketu')
    .addUserOption(option =>
      option.setName('osoba')
        .setDescription('Użytkownik do usunięcia')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-zamknij')
    .setDescription('Zamyka aktualny ticket'),

  new SlashCommandBuilder()
    .setName('ticket-przejmij')
    .setDescription('Przejmuje obsługę aktualnego ticketu')
].map(command => command.toJSON());

/* -------------------------
   POMOCNICZE FUNKCJE KOMEND
------------------------- */

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours} godz. ${minutes} min`;
}

function getMemberHours(userId) {
  const saved = db.hours[userId];

  if (typeof saved === 'number') return saved;
  if (saved && typeof saved.totalMs === 'number') return saved.totalMs;

  return 0;
}

function ensureHoursRecord(userId) {
  if (!db.hours[userId] || typeof db.hours[userId] !== 'object') {
    db.hours[userId] = { totalMs: 0 };
  }

  if (typeof db.hours[userId].totalMs !== 'number') {
    db.hours[userId].totalMs = 0;
  }

  return db.hours[userId];
}

async function sendStaffRecord(interaction, channelId, title, description, color) {
  if (!isAuthorized(interaction.member)) {
    return replyPrivate(
      interaction,
      '❌ Nie masz uprawnień do użycia tej komendy.'
    );
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await getTextChannel(channelId);

  if (!channel) {
    return replyPrivate(
      interaction,
      `❌ Nie udało się znaleźć kanału docelowego: ${channelId}`
    );
  }

  const embed = makeEmbed(title, description, color)
    .addFields(
      {
        name: 'Wystawił',
        value: `${interaction.user}`,
        inline: true
      },
      {
        name: 'Data',
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: true
      }
    );

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });

  await replyPrivate(interaction, '✅ Wpis został wysłany na właściwy kanał.');
}

/* -------------------------
   OBSŁUGA KOMEND SLASH
------------------------- */

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  try {
    if (commandName === 'panele') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyPrivate(interaction, '❌ Tylko administrator może opublikować panele.');
      }

      await interaction.deferReply({ ephemeral: true });

      const results = await Promise.allSettled([
        publishVerificationPanel(),
        publishTicketPanel(),
        publishHoursPanel(),
        publishVacationPanel(),
        publishProofPanel(),
        publishSummonsPanel(),
        publishRoleplayPanel()
      ]);

      const labels = [
        'Weryfikacja',
        'Tickety',
        'Godziny służby',
        'Urlopy',
        'Dokumentacja',
        'Wezwania',
        'Roleplay'
      ];

      const report = results.map((result, index) =>
        `${result.status === 'fulfilled' ? '✅' : '❌'} ${labels[index]}`
      ).join('\n');

      return replyPrivate(
        interaction,
        `**Wynik publikacji paneli:**\n${report}\n\nJeśli coś się nie udało, sprawdź uprawnienia bota i ID kanału.`
      );
    }

    const panelCommands = {
      'weryfikacja': publishVerificationPanel,
      'ticket-panel': publishTicketPanel,
      'godziny-panel': publishHoursPanel,
      'urlop-panel': publishVacationPanel,
      'dowody-panel': publishProofPanel,
      'wezwania-panel': publishSummonsPanel,
      'roleplay-panel': publishRoleplayPanel
    };

    if (panelCommands[commandName]) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyPrivate(interaction, '❌ Tylko administrator może opublikować ten panel.');
      }

      await interaction.deferReply({ ephemeral: true });
      await panelCommands[commandName]();

      return replyPrivate(interaction, '✅ Panel został opublikowany na przypisanym kanale.');
    }

    if (commandName === 'roleplay') {
      const title = interaction.options.getString('tytul', true);
      const description = interaction.options.getString('opis', true);
      const channel = await getTextChannel(CHANNELS.roleplay);

      if (!channel) {
        return replyPrivate(interaction, '❌ Nie znaleziono kanału Roleplay.');
      }

      const embed = makeEmbed(`🎭 ${title}`, description, COLORS.cyan)
        .addFields({
          name: 'Autor wpisu',
          value: `${interaction.user}`,
          inline: true
        });

      await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      return replyPrivate(interaction, '✅ Wpis Roleplay wysłano na kanał Roleplay.');
    }

    if (commandName === 'godziny') {
      const target = interaction.options.getUser('osoba') || interaction.user;

      if (target.id !== interaction.user.id && !isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Nie możesz sprawdzać godzin innych osób.');
      }

      const totalMs = getMemberHours(target.id);
      const activeShift = db.shifts[target.id];

      let description = `**Użytkownik:** ${target}\n**Łączny czas służby:** ${formatDuration(totalMs)}`;

      if (activeShift?.startedAt) {
        description += `\n**Aktualna służba:** rozpoczęta <t:${Math.floor(activeShift.startedAt / 1000)}:R>`;
      } else {
        description += '\n**Aktualna służba:** brak aktywnej zmiany';
      }

      return replyPrivate(
        interaction,
        null,
        makeEmbed('🕒 Godziny służby', description, COLORS.cyan)
      );
    }

    if (commandName === 'pochwala') {
      const target = interaction.options.getUser('osoba', true);
      const reason = interaction.options.getString('powod', true);

      if (!isAuthorized(interaction.member)) {
        return replyPrivate(interaction, '❌ Nie masz uprawnień do wystawiania pochwał.');
      }

      await interaction.deferReply({ ephemeral: true });

      const channel = await getTextChannel(CHANNELS.praises);

      if (!channel) {
        return replyPrivate(interaction, '❌ Nie znaleziono kanału pochwał.');
      }

      const embed = makeEmbed(
        '🏅 Oficjalna pochwała',
        [
          `**Wyróżniona osoba:** ${target}`,
          '',
          '**Powód pochwały:**',
          reason
        ].join('\n'),
        COLORS.success
      ).addFields(
        {
          name: 'Wystawił',
          value: `${interaction.user}`,
          inline: true
        },
        {
          name: 'Data',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        }
      );

      await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      db.praises.push({
        userId: target.id,
        reason,
        issuerId: interaction.user.id,
        createdAt: Date.now()
      });
      saveDB();

      return replyPrivate(interaction, `✅ Pochwała dla ${target} została wysłana na <#${CHANNELS.praises}>.`);
    }

    if (commandName === 'mandat') {
      const target = interaction.options.getUser('osoba', true);
      const reason = interaction.options.getString('powod', true);
      const amount = interaction.options.getInteger('kwota', true);

      const record = {
        userId: target.id,
        reason,
        amount,
        issuerId: interaction.user.id,
        createdAt: Date.now()
      };

      await sendStaffRecord(
        interaction,
        CHANNELS.fines,
        '🚔 Mandat',
        `**Osoba:** ${target}\n**Kwota:** ${amount.toLocaleString('pl-PL')} $ \n**Powód:** ${reason}`,
        COLORS.warning
      );

      db.fines.push(record);
      saveDB();
      return;
    }

    if (commandName === 'wyrok') {
      const target = interaction.options.getUser('osoba', true);
      const reason = interaction.options.getString('powod', true);

      await sendStaffRecord(
        interaction,
        CHANNELS.verdicts,
        '⚖️ Wpis o wyroku',
        `**Osoba:** ${target}\n**Opis wyroku:** ${reason}`,
        COLORS.danger
      );

      db.verdicts.push({
        userId: target.id,
        reason,
        issuerId: interaction.user.id,
        createdAt: Date.now()
      });
      saveDB();
      return;
    }

    if (commandName === 'poszukiwany') {
      const target = interaction.options.getUser('osoba', true);
      const reason = interaction.options.getString('powod', true);

      await sendStaffRecord(
        interaction,
        CHANNELS.wanted,
        '🚨 Osoba poszukiwana',
        `**Osoba:** ${target}\n**Powód:** ${reason}`,
        COLORS.danger
      );

      db.wanted.push({
        userId: target.id,
        reason,
        issuerId: interaction.user.id,
        createdAt: Date.now()
      });
      saveDB();
      return;
    }

    if (commandName === 'ostrzezenie') {
      const target = interaction.options.getUser('osoba', true);
      const reason = interaction.options.getString('powod', true);

      await sendStaffRecord(
        interaction,
        CHANNELS.logs,
        '⚠️ Ostrzeżenie',
        `**Osoba:** ${target}\n**Powód:** ${reason}`,
        COLORS.warning
      );

      db.warns.push({
        userId: target.id,
        reason,
        issuerId: interaction.user.id,
        createdAt: Date.now()
      });
      saveDB();
      return;
    }

    if (commandName === 'urlop') {
      return interaction.showModal(buildVacationModal());
    }

    if (commandName === 'ticket-dodaj') {
      if (!interaction.channel?.name?.startsWith('ticket-')) {
        return replyPrivate(interaction, '❌ Użyj tej komendy wewnątrz ticketu.');
      }

      if (!isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Tylko obsługa może zarządzać dostępem do ticketu.');
      }

      const user = interaction.options.getUser('osoba', true);

      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      return replyPrivate(interaction, `✅ Dodano ${user} do ticketu.`);
    }

    if (commandName === 'ticket-usun') {
      if (!interaction.channel?.name?.startsWith('ticket-')) {
        return replyPrivate(interaction, '❌ Użyj tej komendy wewnątrz ticketu.');
      }

      if (!isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Tylko obsługa może zarządzać dostępem do ticketu.');
      }

      const user = interaction.options.getUser('osoba', true);

      await interaction.channel.permissionOverwrites.delete(user.id);

      return replyPrivate(interaction, `✅ Usunięto ${user} z ticketu.`);
    }

    if (commandName === 'ticket-zamknij') {
      if (!interaction.channel?.name?.startsWith('ticket-')) {
        return replyPrivate(interaction, '❌ Użyj tej komendy wewnątrz ticketu.');
      }

      if (!isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Tylko obsługa może zamknąć ticket.');
      }

      await interaction.deferReply({ ephemeral: true });

      const closedCategory = interaction.guild.channels.cache.get(CLOSED_CATEGORY_ID);

      if (closedCategory?.type === ChannelType.GuildCategory) {
        await interaction.channel.setParent(CLOSED_CATEGORY_ID);
      }

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { ViewChannel: false }
      );

      await interaction.channel.permissionOverwrites.edit(
        interaction.user.id,
        { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }
      );

      await interaction.channel.send({
        embeds: [
          makeEmbed(
            '🔒 Ticket zamknięty',
            `Zamknięto zgłoszenie. Obsługa: ${interaction.user}`,
            COLORS.danger
          )
        ],
        allowedMentions: { parse: [] }
      });

      return replyPrivate(interaction, '✅ Ticket został zamknięty.');
    }

    if (commandName === 'ticket-przejmij') {
      if (!interaction.channel?.name?.startsWith('ticket-')) {
        return replyPrivate(interaction, '❌ Użyj tej komendy wewnątrz ticketu.');
      }

      if (!isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Tylko obsługa może przejąć ticket.');
      }

      await interaction.channel.send({
        embeds: [
          makeEmbed(
            '🛡️ Ticket przejęty',
            `Za zgłoszenie odpowiada teraz ${interaction.user}.`,
            COLORS.success
          )
        ],
        allowedMentions: { parse: [] }
      });

      return replyPrivate(interaction, '✅ Przejęto obsługę ticketu.');
    }
  } catch (error) {
    console.error(`❌ Błąd komendy /${commandName}:`, error);

    return replyPrivate(
      interaction,
      '❌ Wystąpił błąd podczas wykonywania tej czynności. Sprawdź uprawnienia bota i kanały.'
    );
  }
}

/* =========================================================
   CZĘŚĆ 4/4 — INTERAKCJE I URUCHOMIENIE BOTA
========================================================= */

/* -------------------------
   LOGI
------------------------- */

async function writeLog(title, description, color = COLORS.neutral) {
  try {
    const channel = await getTextChannel(CHANNELS.logs);
    if (!channel) return;

    await channel.send({
      embeds: [makeEmbed(title, description, color)],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error('Błąd zapisu logu:', error.message);
  }
}

/* -------------------------
   TWORZENIE TICKETU
------------------------- */

async function createTicket(interaction, typeKey) {
  const type = TICKET_TYPES[typeKey];

  if (!type) {
    return replyPrivate(interaction, '❌ Nieprawidłowa kategoria zgłoszenia.');
  }

  const existing = interaction.guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.topic?.includes(`ticket-owner:${interaction.user.id}`)
  );

  if (existing) {
    return replyPrivate(
      interaction,
      `❌ Masz już otwarte zgłoszenie: ${existing}`
    );
  }

  const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return replyPrivate(
      interaction,
      '❌ Nie znaleziono kategorii ticketów. Sprawdź konfigurację serwera.'
    );
  }

  const channelName = `ticket-${typeKey}-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 90);

  const permissionOverwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: ROLES.ticketStaff,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  const ticket = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID,
    topic: `ticket-owner:${interaction.user.id} | category:${typeKey}`,
    permissionOverwrites,
    reason: `Nowe zgłoszenie od ${interaction.user.tag}`
  });

  const embed = makeEmbed(
    `${type.emoji} ${type.label}`,
    [
      `Witaj ${interaction.user}! Twoje zgłoszenie zostało utworzone.`,
      '',
      `**Kategoria:** ${type.label}`,
      '**Opisz dokładnie swoją sprawę.** Obsługa odpowie, gdy będzie dostępna.',
      '',
      'Nie oznaczaj administracji bez potrzeby i nie wysyłaj danych wrażliwych.',
      '',
      `**Zgłaszający:** ${interaction.user.tag}`
    ].join('\n'),
    COLORS.purple
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton('ticket_close', 'Zamknij zgłoszenie', ButtonStyle.Danger, '🔒'),
    makeButton('ticket_claim', 'Przejmij zgłoszenie', ButtonStyle.Success, '🛡️')
  );

  await ticket.send({
    content: `${interaction.user} <@&${ROLES.ticketStaff}>`,
    embeds: [embed],
    components: [row],
    allowedMentions: {
      users: [interaction.user.id],
      roles: [ROLES.ticketStaff]
    }
  });

  await replyPrivate(interaction, `✅ Utworzono ticket: ${ticket}`);

  await writeLog(
    '🎫 Nowy ticket',
    `**Kanał:** ${ticket}\n**Autor:** ${interaction.user.tag}\n**Kategoria:** ${type.label}`,
    COLORS.purple
  );
}

/* -------------------------
   GODZINY SŁUŻBY
------------------------- */

async function startShift(interaction) {
  if (db.shifts[interaction.user.id]?.startedAt) {
    return replyPrivate(interaction, '⚠️ Masz już rozpoczętą służbę.');
  }

  db.shifts[interaction.user.id] = {
    startedAt: Date.now()
  };

  saveDB();

  await replyPrivate(
    interaction,
    null,
    makeEmbed(
      '🟢 Służba rozpoczęta',
      `Rozpoczęto służbę o <t:${Math.floor(Date.now() / 1000)}:F>.`,
      COLORS.success
    )
  );

  await writeLog(
    '🟢 Rozpoczęcie służby',
    `**Użytkownik:** ${interaction.user}\n**Godzina:** <t:${Math.floor(Date.now() / 1000)}:F>`,
    COLORS.success
  );
}

async function stopShift(interaction) {
  const shift = db.shifts[interaction.user.id];

  if (!shift?.startedAt) {
    return replyPrivate(interaction, '⚠️ Nie masz aktywnej służby.');
  }

  const elapsed = Math.max(0, Date.now() - shift.startedAt);
  const record = ensureHoursRecord(interaction.user.id);

  record.totalMs += elapsed;
  delete db.shifts[interaction.user.id];
  saveDB();

  await replyPrivate(
    interaction,
    null,
    makeEmbed(
      '🔴 Służba zakończona',
      [
        `**Czas tej służby:** ${formatDuration(elapsed)}`,
        `**Łączny czas służby:** ${formatDuration(record.totalMs)}`
      ].join('\n'),
      COLORS.success
    )
  );

  await writeLog(
    '🔴 Zakończenie służby',
    `**Użytkownik:** ${interaction.user}\n**Czas zmiany:** ${formatDuration(elapsed)}\n**Łącznie:** ${formatDuration(record.totalMs)}`,
    COLORS.success
  );
}

async function checkShift(interaction) {
  const record = ensureHoursRecord(interaction.user.id);
  const shift = db.shifts[interaction.user.id];

  let total = record.totalMs;

  if (shift?.startedAt) {
    total += Math.max(0, Date.now() - shift.startedAt);
  }

  const description = [
    `**Użytkownik:** ${interaction.user}`,
    `**Łączny czas służby:** ${formatDuration(total)}`,
    `**Status:** ${shift?.startedAt ? '🟢 Na służbie' : '⚪ Poza służbą'}`,
    shift?.startedAt
      ? `**Rozpoczęcie:** <t:${Math.floor(shift.startedAt / 1000)}:F>`
      : ''
  ].filter(Boolean).join('\n');

  return replyPrivate(
    interaction,
    null,
    makeEmbed('🕒 Twoje godziny służby', description, COLORS.cyan)
  );
}

/* -------------------------
   ZAMYKANIE TICKETU
------------------------- */

async function closeTicket(interaction) {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText ||
      !channel.name.startsWith('ticket-')) {
    return replyPrivate(interaction, '❌ Ten przycisk działa tylko w tickecie.');
  }

  if (!isStaff(interaction.member)) {
    const ownerId = channel.topic?.match(/ticket-owner:(\d+)/)?.[1];

    if (ownerId !== interaction.user.id) {
      return replyPrivate(interaction, '❌ Nie możesz zamknąć tego zgłoszenia.');
    }
  }

  await interaction.deferReply({ ephemeral: true });

  const closedCategory = interaction.guild.channels.cache.get(CLOSED_CATEGORY_ID);

  if (closedCategory?.type === ChannelType.GuildCategory) {
    await channel.setParent(CLOSED_CATEGORY_ID);
  }

  const ownerId = channel.topic?.match(/ticket-owner:(\d+)/)?.[1];

  if (ownerId) {
    await channel.permissionOverwrites.edit(ownerId, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false
    });
  }

  await channel.send({
    embeds: [
      makeEmbed(
        '🔒 Zgłoszenie zamknięte',
        `Zgłoszenie zamknął użytkownik ${interaction.user}.\nKanał został przeniesiony do archiwum, jeśli skonfigurowano kategorię zamkniętych ticketów.`,
        COLORS.danger
      )
    ],
    allowedMentions: { parse: [] }
  });

  await replyPrivate(interaction, '✅ Zgłoszenie zostało zamknięte.');

  await writeLog(
    '🔒 Zamknięcie ticketu',
    `**Kanał:** ${channel.name}\n**Zamknął:** ${interaction.user.tag}`,
    COLORS.danger
  );
}

/* -------------------------
   OBSŁUGA PRZYCISKÓW I MENU
------------------------- */

async function handleComponent(interaction) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_create') {
      return createTicket(interaction, interaction.values[0]);
    }
    return;
  }

  if (!interaction.isButton()) return;

  switch (interaction.customId) {
    case 'verify_start': {
      const a = Math.floor(Math.random() * 8) + 2;
      const b = Math.floor(Math.random() * 8) + 2;
      const question = `${a} + ${b}`;

      verificationChallenges.set(interaction.user.id, {
        answer: String(a + b),
        createdAt: Date.now()
      });

      return interaction.showModal(buildVerificationModal(question));
    }

    case 'hours_start':
      return startShift(interaction);

    case 'hours_stop':
      return stopShift(interaction);

    case 'hours_check':
      return checkShift(interaction);

    case 'vacation_start':
      return interaction.showModal(buildVacationModal());

    case 'proof_start':
      return interaction.showModal(buildProofModal());

    case 'summons_start':
      return interaction.showModal(buildSummonsModal());

    case 'roleplay_info':
      return replyPrivate(
        interaction,
        '🎭 Wpisy Roleplay wysyłaj komendą `/roleplay`. Trafiają na kanał przeznaczony do Roleplay.'
      );

    case 'ticket_close':
      return closeTicket(interaction);

    case 'ticket_claim': {
      if (!isStaff(interaction.member)) {
        return replyPrivate(interaction, '❌ Tylko obsługa może przejąć ticket.');
      }

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🛡️ Ticket przejęty',
            `Za zgłoszenie odpowiada teraz ${interaction.user}.`,
            COLORS.success
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    default:
      return;
  }
}

/* -------------------------
   OBSŁUGA FORMULARZY
------------------------- */

async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'verify_answer') {
    const challenge = verificationChallenges.get(interaction.user.id);
    verificationChallenges.delete(interaction.user.id);

    if (!challenge || Date.now() - challenge.createdAt > 5 * 60 * 1000) {
      return replyPrivate(
        interaction,
        '⌛ Weryfikacja wygasła. Kliknij przycisk i spróbuj ponownie.'
      );
    }

    const answer = interaction.fields.getTextInputValue('answer').trim();

    if (answer !== challenge.answer) {
      return replyPrivate(
        interaction,
        '❌ Niepoprawna odpowiedź. Kliknij przycisk weryfikacji i spróbuj ponownie.'
      );
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const role = interaction.guild.roles.cache.get(ROLES.verified);

    if (!role) {
      return replyPrivate(interaction, '❌ Nie znaleziono roli zweryfikowanego użytkownika.');
    }

    if (member.roles.cache.has(role.id)) {
      return replyPrivate(interaction, '✅ Masz już rolę zweryfikowanego użytkownika.');
    }

    await member.roles.add(role);

    await replyPrivate(
      interaction,
      null,
      makeEmbed(
        '✅ Weryfikacja zakończona',
        'Gratulacje! Otrzymujesz dostęp do serwera NayRP ER:LC.',
        COLORS.success
      )
    );

    await writeLog(
      '🔐 Weryfikacja użytkownika',
      `**Użytkownik:** ${interaction.user.tag}\n**Status:** zakończona pomyślnie`,
      COLORS.success
    );

    return;
  }

  if (interaction.customId === 'vacation_submit') {
    const character = interaction.fields.getTextInputValue('character');
    const start = interaction.fields.getTextInputValue('start');
    const end = interaction.fields.getTextInputValue('end');
    const reason = interaction.fields.getTextInputValue('reason');

    const channel = await getTextChannel(CHANNELS.leaves);

    db.vacations.push({
      userId: interaction.user.id,
      character,
      start,
      end,
      reason,
      createdAt: Date.now(),
      status: 'Oczekuje'
    });
    saveDB();

    if (channel) {
      await channel.send({
        embeds: [
          makeEmbed(
            '📅 Nowy wniosek urlopowy',
            `**Autor:** ${interaction.user}\n**Postać:** ${character}\n**Od:** ${start}\n**Do:** ${end}\n**Powód:** ${reason}\n**Status:** Oczekuje na rozpatrzenie`,
            COLORS.warning
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    return replyPrivate(
      interaction,
      channel
        ? '✅ Wniosek urlopowy został wysłany do rozpatrzenia.'
        : '⚠️ Wniosek zapisano, ale nie udało się wysłać go na kanał. Powiadom administrację.'
    );
  }

  if (interaction.customId === 'proof_submit') {
    const name = interaction.fields.getTextInputValue('name');
    const birth = interaction.fields.getTextInputValue('birth');
    const idea = interaction.fields.getTextInputValue('idea');

    const channel = await getTextChannel(CHANNELS.proofs);

    db.proofs.push({
      userId: interaction.user.id,
      name,
      birth,
      idea,
      createdAt: Date.now()
    });
    saveDB();

    if (channel) {
      await channel.send({
        embeds: [
          makeEmbed(
            '📁 Dokumentacja postaci',
            `**Autor:** ${interaction.user}\n**Imię i nazwisko:** ${name}\n**Data urodzenia postaci:** ${birth}\n**Opis postaci:**\n${idea}`,
            COLORS.main
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    return replyPrivate(
      interaction,
      channel
        ? '✅ Dokumentacja została przesłana.'
        : '⚠️ Dokumentację zapisano, ale nie udało się wysłać jej na kanał.'
    );
  }

  if (interaction.customId === 'summons_submit') {
    const character = interaction.fields.getTextInputValue('character');
    const arrival = interaction.fields.getTextInputValue('arrival');
    const details = interaction.fields.getTextInputValue('details');

    if (!isAuthorized(interaction.member)) {
      return replyPrivate(interaction, '❌ Tylko uprawniona kadra może wystawiać wezwania.');
    }

    const channel = await getTextChannel(CHANNELS.summons);

    db.summons[`${Date.now()}-${interaction.user.id}`] = {
      character,
      arrival,
      details,
      issuerId: interaction.user.id,
      createdAt: Date.now()
    };
    saveDB();

    if (channel) {
      await channel.send({
        embeds: [
          makeEmbed(
            '📨 Oficjalne wezwanie',
            `**Dotyczy postaci:** ${character}\n**Termin:** ${arrival}\n**Powód:** ${details}\n**Wystawił:** ${interaction.user}`,
            COLORS.purple
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    return replyPrivate(
      interaction,
      channel
        ? '✅ Wezwanie zostało wysłane.'
        : '⚠️ Wezwanie zapisano, ale nie udało się wysłać go na kanał.'
    );
  }
}

/* -------------------------
   JEDEN GŁÓWNY HANDLER
------------------------- */

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      return await handleSlashCommand(interaction);
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      return await handleComponent(interaction);
    }

    if (interaction.isModalSubmit()) {
      return await handleModal(interaction);
    }
  } catch (error) {
    console.error('❌ Błąd interakcji:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: '❌ Wystąpił błąd. Spróbuj ponownie lub skontaktuj się z administracją.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Wystąpił błąd. Spróbuj ponownie lub skontaktuj się z administracją.',
          ephemeral: true
        });
      }
    } catch {}
  }
});

/* -------------------------
   START I REJESTRACJA KOMEND
------------------------- */

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Zalogowano jako ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log(`✅ Zarejestrowano ${commands.length} komend na serwerze.`);
  } catch (error) {
    console.error('❌ Nie udało się zarejestrować komend:', error);
  }
});

process.on('unhandledRejection', error => {
  console.error('❌ Nieobsłużony błąd:', error);
});

client.login(TOKEN).catch(error => {
  console.error('❌ Nie udało się zalogować bota:', error);
});
