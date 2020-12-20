const names = require('./names/game-of-thrones');
const Express = require('express')();
const Http = require('http').Server(Express);
const corsOrigin =
  process.env.NODE_ENV === 'production'
    ? 'https://spades-game.netlify.app/'
    : 'http://192.168.0.8:8080';
const io = require('socket.io')(Http, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const suits = ['S', 'D', 'H', 'C'];
const values = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
const playerNames = [];
let orderSet = false;
let playerOrder = [];
let hotseat = 0;
let dealer = 0;
let openingHand = false;
let players = [];
let teams = [
  {
    name: 'No Team',
    players: [],
  },
  {
    name: 'Team One',
    players: [],
  },
  {
    name: 'Team Two',
    players: [],
  },
];
bids: [{ teamOne: 0 }, { teamTwo: 0 }];
const deck = getDeck();
let cardsDealt = false;

io.on('connection', async (socket) => {
  console.log('a user connected ' + socket.id);
  await players.push({
    id: socket.id,
    name: getRandomName(),
    hand: [],
    ready: true,
  });
  await socket.emit('newPlayer', socket.id, players);
  // temp init teams method
  await initTeams(socket.id);
  updatePlayers(players);
  updateTeams(teams);

  socket.on('resetPlayers', () => {
    updatePlayers(players);
  });

  socket.on('addPlayer', async (name) => {
    const player = updatePlayerProp(socket.id, 'name', name);
    await getTeam('No Team').players.push(player);
    if (players.length === 4) {
      io.emit('fullGame', true);
    }
    updatePlayers(players);
    updateTeams(teams);
  });

  socket.on('playerReady', async (value) => {
    await updatePlayerProp(socket.id, 'ready', value);
    updatePlayers(players);
  });
  socket.on('setPlayOrder', async () => {
    if (!orderSet) {
      teamArray = teams;
      let index = 1;
      for (let i = 0; i < 4; i++) {
        playerOrder.push(teamArray[index].players.shift());

        index = index === 1 ? 2 : 1;
      }
      players = playerOrder;
    }
    updatePlayers(players);
    orderSet = true;
  });

  socket.on('shuffleDeck', async () => {
    const newDeck = await getDeck();
    await dealCards(shuffleDeck(newDeck));
    await updatePlayers(players);
    let cardsDealt = true;
    io.emit('cardsDealt', cardsDealt);
  });
  socket.on('selectTeam', async (team) => {
    const player = getPlayer(socket.id);
    await clearPlayerFromTeams(player);
    await getTeam(team).players.push(player);
    await updatePlayerProp(id, 'team', team);
    updateTeams(teams);
  });
  socket.on('bidSelect', async (newBid) => {
    await updatePlayerProp(socket.id, 'bid', newBid);
    const player = getPlayer(socket.id);
    await setBids(player);
    updatePlayers(players);
    updateTeams(teams);
    if (fire()) {
      openingHand = true;
      io.emit('nextTurn', dealer);
      io.emit('startRound', true, openingHand);
    }
  });

  // card functions
  function shuffleDeck(deck) {
    let newDeck = deck;

    for (var i = 0; i < 1000; i++) {
      var location1 = Math.floor(Math.random() * newDeck.length);
      var location2 = Math.floor(Math.random() * newDeck.length);
      var tmp = newDeck[location1];

      newDeck[location1] = newDeck[location2];
      newDeck[location2] = tmp;
    }
    return newDeck;
  }
  async function dealCards(deck) {
    console.table(deck);
    await players.forEach((player) => {
      player.hand = [];
    });
    console.table(players);
    await dealLoop(players, deck);

    return players;
  }
  function dealLoop(players, deck) {
    for (var i = 0; i < 13; i++) {
      for (var x = 0; x < players.length; x++) {
        var card = deck.pop();
        players[x].hand.push(card);
      }
    }
    return players;
  }
  socket.on('disconnect', async () => {
    console.log('disconnected ' + socket.id);
    clearPlayerFromTeams(getPlayer(socket.id));
    const newPlayerArr = players.filter((player) => player.id !== socket.id);
    players = newPlayerArr;
    updatePlayers(players);
    updateTeams(teams);
  });
});

// helper functions
function updatePlayers(players) {
  io.emit('updatePlayers', players);
  return players;
}
function updateTeams(teams) {
  io.emit('updateTeams', teams);
  return teams;
}
function updatePlayerProp(id, prop, value) {
  const player = players.find((player) => player.id === id);
  player[prop] = value;
  return player;
}
function setBids(player) {
  const team = player.team;
  clearPlayerFromTeams(player);
  getTeam(team).players.push(player);
  return team;
}
function getTeam(value) {
  return teams.find((team) => team.name === value);
}
function getPlayer(id) {
  return players.find((player) => player.id === id);
}
function clearPlayerFromTeams(playerData) {
  console.log(teams);
  teams.forEach((team) => {
    const newPlayerArray = team.players.filter(
      (player) => player !== playerData
    );
    team.players = newPlayerArray;
    return team;
  });
  console.log(teams);
}
function getDeck() {
  var deck = new Array();
  for (var i = 0; i < suits.length; i++) {
    for (var x = 0; x < values.length; x++) {
      var card = { value: values[x], suit: suits[i], rank: x };
      deck.push(card);
    }
  }
  return deck;
}

function fire() {
  return players.filter((player) => player.bid).length === 4;
}

function getRandomName() {
  const name =
    names.characters[Math.floor(Math.random() * names.characters.length)]
      .characterName;
  return name;
}
// temp init teams
async function initTeams(id) {
  const player = getPlayer(id);
  await clearPlayerFromTeams(player);
  const team = getEmptyTeam();
  await team.players.push(player);
  await updatePlayerProp(id, 'team', team.name);
  updateTeams(teams);
}
function getEmptyTeam() {
  return teams[1].players.length < 2 ? teams[1] : teams[2];
}
Http.listen(process.env.PORT || 3000, () => {
  console.log('listening at :3000...');
});
