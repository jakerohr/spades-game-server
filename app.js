const names = require('./names/game-of-thrones');
const Express = require('express')();
const Http = require('http').Server(Express);
const ip = require("ip");

const corsOrigin =
  process.env.NODE_ENV === 'production'
    ? 'https://spades-game.netlify.app'
    : `http://${ip.address()}:8080`;
    console.log(corsOrigin)
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
let suitPlayed = '';
let openingHand = false;
let cardsPlayedThisHand = [];
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
// bids: [{ teamOne: 0 }, { teamTwo: 0 }];
// const deck = getDeck();
// let cardsDealt = false;

io.on('connection', async (socket) => {
  console.log('a user connected ' + socket.id);
  players.push({
    id: socket.id,
    name: getRandomName(),
    hand: [],
    tricksTaken: 0,
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
    getTeam('No Team').players.push(player);
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
    const newDeck = getDeck();
    await dealCards(shuffleDeck(newDeck));
    await updatePlayers(players);
    let cardsDealt = true;
    io.emit('cardsDealt', cardsDealt);
  });
  socket.on('selectTeam', async (team) => {
    const player = getPlayer(socket.id);
    clearPlayerFromTeams(player);
    getTeam(team).players.push(player);
    await updatePlayerProp(id, 'team', team);
    updateTeams(teams);
  });
  socket.on('bidSelect', async (newBid) => {
    await updatePlayerProp(socket.id, 'bid', newBid);
    const player = getPlayer(socket.id);
    await setBids(player);
    updatePlayers(players);
    updateTeams(teams);
    if (bidsIn()) {
      openingHand = true;
      hotseat = dealer;
      io.emit('nextTurn', hotseat);
      io.emit('openingHand', openingHand);
      io.emit('startRound', true);
    }
  });
  socket.on('playCard', async (card) => { 
    io.emit('winningPlayer');

    if (!suitPlayed) {
      const suit = openingHand ? 'C' : card.suit
      setSuit(suit);
    }
    const player = getPlayer(socket.id);
    const hand = player.hand;
    const cardIndex = hand.findIndex(item => item.id === card.id);
    if (cardIndex === -1) return
    hand.splice(cardIndex, 1);
    await updatePlayerProp(socket.id, 'hand', hand);
    updateHand(card, socket.id);
    io.emit('layCard', card, socket.id);
    if (cardsPlayedThisHand.length === 4) {
      const winningHand = determineWinner();
      const winningPlayer = getPlayer(winningHand.id);
      const tricks = winningPlayer.tricksTaken + 1;
      await updatePlayerProp(winningPlayer.id, 'tricksTaken', tricks);
      io.emit('winningPlayer', winningPlayer.name);
      resetHand(winningPlayer.id);
    } else {
      updateHotseat();
    }
    await updatePlayers(players);
    io.emit('nextTurn', hotseat);


  }) 

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
    players.forEach((player) => {
      player.hand = [];
    });
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
  function setSuit(suit) {
    suitPlayed = suit || ''
    io.emit('setSuit', suitPlayed);
  }
  function resetHand(id) {
    cardsPlayedThisHand = [];
    openingHand = false;
    io.emit('openingHand', openingHand);
    io.emit('clearBoard');
    playerIndex = players.findIndex(player => player.id === id);
    setSuit();
    hotseat = playerIndex;
    return hotseat;
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
function updateHotseat() {
  hotseat = hotseat < 3 ? hotseat + 1 : 0;
  return hotseat;
}
function updateHand(card, id) {
  cardsPlayedThisHand.push({ id, card });
  return cardsPlayedThisHand;
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
  teams.forEach((team) => {
    const newPlayerArray = team.players.filter(
      (player) => player !== playerData
    );
    team.players = newPlayerArray;
    return team;
  });
}
function determineWinner() {
  // check for high spade
  const spades = cardsPlayedThisHand.filter(hand => hand.card.suit === 'S')
  const matchedSuits = cardsPlayedThisHand.filter(hand => hand.card.suit === suitPlayed)
  const arrayToCheck = spades.length ? spades : matchedSuits;
  const cardRank = arrayToCheck.reduce((max, item) => item.card.rank > max ? item.card.rank : max, arrayToCheck[0].card.rank);
  const winningCard = arrayToCheck.find(item => item.card.rank === cardRank);
  return cardsPlayedThisHand.find(hand => hand.card.id  === winningCard.card.id)
}

function getDeck() {
  var deck = new Array();
  for (var i = 0; i < suits.length; i++) {
    for (var x = 0; x < values.length; x++) {
      var card = { value: values[x], suit: suits[i], rank: x };
      deck.push(card);
    }
  }
  deck.forEach((card, index) => {
    card.id = index;
  })
  return deck;
}
function bidsIn() {
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
  clearPlayerFromTeams(player);
  const team = getEmptyTeam();
  team.players.push(player);
  await updatePlayerProp(id, 'team', team.name);
  updateTeams(teams);
}
function getEmptyTeam() {
  return teams[1].players.length < 2 ? teams[1] : teams[2];
}
Http.listen(process.env.PORT || 3000, () => {
  console.log('listening at :3000...');
});
