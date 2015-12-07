/* global Phaser */

var game;

function initGame(ctx) {
  var updateLength = 1;
  var updateCount = 0;
  var command = '';
  var speechButtonRate = 1000;
  var nextSpeechButtonPressTime = 0;
  var isFairyNextToHouse = false;
  var toggleRecordSpeechCommandButton;
  var player;
  var houses;
  var house;
  var rightHousePosition = 720;
  var leftHousePosition = 0;
  var currentHousePosition = 1;
  var explosions;
  var cursors;
  var level = 1;
  var levelString;
  var levelText;

  var LEFT_COMMAND = 'left';
  var RIGHT_COMMAND = 'right';
  var DESTROY_HOUSE_COMMAND = 'destroy_house';

  function parseMoveActionCommand(text) {
    var directionCommands = [LEFT_COMMAND, RIGHT_COMMAND];

    return directionCommands.find(function(directionCommand) {
      return text.toLowerCase().split(' ').indexOf(directionCommand) !== -1;
    });
  }

  function parseDestroyActionCommand(text) {
    if (isFairyNextToHouse && text.toLowerCase().split(' ').indexOf('house') !== -1) {
      return DESTROY_HOUSE_COMMAND;
    }
  }

  var subject = 'melvin';

  var relationActions = [
    {
      action: 'move',
      parseGameCommand: parseMoveActionCommand
    },
    {
      action: 'destroy',
      parseGameCommand: parseDestroyActionCommand
    }
  ];

  game = new Phaser.Game(750, 300, Phaser.AUTO, 'example-game', { preload: preload, create: create, update: update, render: render });

  function preload() {
    var fairyData = [
        '....F...........F...',
        '...F1F.........F1F..',
        '..F111F.......F111F..',
        '.F11111F.333.F1111F..',
        '.F11111534333511111F',
        'F111113323333331111F',
        'F111133333333333111F',
        'F111137773337773111F',
        '.F1113858777858311F.',
        '.F1113858888858311F..',
        '.F111378888888731F..',
        '..F11133333333311F..',
        '...FF....65556......',
        '.......6.757.6......',
        '.......5.666.5......',
        '.......5.777.5......',
        '........6..7........',
        '........7..7........'
    ];

    var houseData = [
        '.....6.....',
        '....676....',
        '...67676...',
        '..6767676..',
        '.676767676.',
        '67676767676',
        '55BBB555555',
        '55BBB55EE55',
        '552BB55EE55',
        '55BBB556655',
        '55BBB555555',
        '55555555555',
        '55555555555'
    ];

    game.create.texture('fairy', fairyData, 3, 3, 0);
    game.load.spritesheet('kaboom', 'images/explode.png', 128, 128);
    house = game.create.texture('house', houseData, 3, 3, 0);
  }

  function create() {
    game.physics.startSystem(Phaser.Physics.ARCADE);

    player = game.add.sprite(100, 100, 'fairy');

    game.physics.arcade.enable(player);

    player.body.collideWorldBounds = true;
    player.body.gravity.y = 500;

    houses = game.add.physicsGroup();
    house = houses.create(rightHousePosition, 260, 'house');

    explosions = game.add.group();
    explosions.createMultiple(30, 'kaboom');

    //  The current level
    levelString = 'Level : ';
    levelText = game.add.text(10, 10, levelString + level, { font: '34px Arial', fill: '#fff' });

    houses.setAll('body.immovable', true);

    cursors = game.input.keyboard.createCursorKeys();
    toggleRecordSpeechCommandButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
    ctx.toggleRecordSpeechCommand();
  }

  function update() {
    game.physics.arcade.collide(player, houses, collisionHandler);

    if (updateCount > updateLength) {
      command = '';
    }

    if (ctx.relations) {
      console.log(ctx.relations);
      command = parseRelationsForCommand(ctx.relations);
      updateCount = 0;
      ctx.relations = null;
    }

    if (toggleRecordSpeechCommandButton.isDown) {
      if (game.time.time >= nextSpeechButtonPressTime) {
        nextSpeechButtonPressTime = game.time.time + speechButtonRate;
        console.log('toggling recording');
        ctx.toggleRecordSpeechCommand();
      }
    }

    switch (command) {
      case LEFT_COMMAND:
        updateCount++;
        player.body.velocity.x = -250;
        break;
      case RIGHT_COMMAND:
        updateCount++;
        player.body.velocity.x = 250;
        break;
      case DESTROY_HOUSE_COMMAND:
        house.kill();
        isFairyNextToHouse = false;
        var explosion = explosions.getFirstExists(false, false, house.body.x, house.body.y);
        explosion.play('kaboom', 30, false, true);
        level++;
        levelText.text = levelString + level;
        command = '';

        if (currentHousePosition == 1) {
          currentHousePosition = 2;
          house = houses.create(leftHousePosition, 260, 'house');
          houses.setAll('body.immovable', true);
        } else {
          currentHousePosition = 1;
          house = houses.create(rightHousePosition, 260, 'house');
          houses.setAll('body.immovable', true);
        }

        break;
    }
  }

  function render() {

  }

  function collisionHandler() {
    isFairyNextToHouse = true;
  }

  function parseRelationsForCommand(relations) {
    try {
      var relationWithSubject = relations.find(function(relation) {
        return relation.subject.text.toLowerCase() === subject;
      });

      if (!relationWithSubject) {
        return;
      }

      var relationAction = relationActions.find(function(relationAction) {
        return relationAction.action === relationWithSubject.action.lemmatized.toLowerCase();
      });

      if (!!relationAction) {
        return relationAction.parseGameCommand(relationWithSubject.object.text);
      }
    } catch (e) {
      console.log('An error occurred while parsing speech commands', e);
    }
  }

  return game;
}

exports.initGame = initGame;
