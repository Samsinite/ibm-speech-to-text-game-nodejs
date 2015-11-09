A Speech Controlled Game
=========================

In this article, we will be modifying the [Speech To Text Node.js sample application][speech-to-text-nodejs] from IBM Watson Tradeoff Analytics, and customizing it to build a speech controlled game. We will use the [IBM Watson Speech To Text service][speech-to-text-docs] to convert human audio voice into text, and the [Alchemy API Relation Extraction service][alchemy-api] to extract relations from the text. The completed game will listen for voice commands, and uses these commands to control a character in the game. Melvin -- the main character -- will be able to walk toward a house, destroy it, and level up.


## What you'll need to build this Application
 - A [Bluemix][bluemix-registration] account
 - The [Cloud Foundry CLI][cloud-foundry] tool installed and setup
 - A basic understanding of [Javascript][javascript-wiki]
 - A basic understanding of the [Node.js][node-js] framework and [Node Package Manager][npm-js]

## Bluemix setup
 First, lets setup our Bluemix instance and provision it to have access to both the Watson Speed To Text service, and the Alchemy API service.
 1. Clone or download the [Speech To Text Node.JS demo app][speech-to-text-nodejs]
    - Clone the git repository
        ```sh
        $ git clone https://github.com/watson-developer-cloud/speech-to-text-nodejs.git
        ```
    - [Download the zip][speech-to-text-nodejs-zip] and unpack it into a directory of your choosing
 2. Navigate into the project directory, and edit the `manifest.yml` file to read
    ```yml
    ---
    declared-services:
      alchemy-api-service-free:
        label: alchemy_api
        plan: Free
      speech-to-text-service-standard:
        label: speech_to_text
        plan: standard
    applications:
    - name: speech-to-text-game
      path: .
      command: npm start
      memory: 512M
      services:
      - speech-to-text-service-standard
      - alchemy-api-service-free
      env:
        NODE_ENV: production
    ```
 1. [Create a Bluemix Account][bluemix-registration] or use an existing account. Watson Services in Beta are free to use.

 1. Download and install the [Cloud-foundry CLI][cloud-foundry] tool

 1. Connect to Bluemix using the `cf` command line tool.
     ```sh
     $ cf api https://api.ng.bluemix.net
     $ cf login -u <your user ID>
     ```

 1. Create the Speech to Text service in Bluemix.
     ```sh
     $ cf create-service speech_to_text standard speech-to-text-service-standard
     ```

 1. Create the Alchemy API service in Bluemix.
     ```sh
     $ cf create-service alchemy_api free alchemy-api-service-free
     ```
 1. Push it live!
     ```sh
     $ cf push
     ```

## Setting up Bluemix Credentials For Local Development
For local development, we want to be able to store our credentials locally, but keep them out of our repository and have the flexibility to use different credentials in production. A common solution for this problem is to store all credentials inside of a file called `.env` and have the application read and use these values when defined. Thankfully, there is already a node library that has been built that does most of the work called `node-env-file`. Lets add this library dependency to our application:
  ```sh
  npm install --save node-env-file
  ```
Next, log into your Bluemix account and select your new `speech-to-text-game` from the dashboard. Expand your credentials for both services so that you can write them down. Once we have access to our credentials, we need to create a `.env` file and insert our credentials as shown below:

  `.env:`
  ```sh
  USERNAME=[your-speech-to-text-username-goes-here]
  PASSWORD=[your-speech-to-text-password-goes-here]
  ALCHEMY_API_KEY=[your-alchemy-api-key-goes-here]
  ```
Now lets change the `app.js` to use the credentials from the `.env` file:

  ```js
  var express      = require('express');
  var app          = express();
  var vcapServices = require('vcap_services');
  var extend       = require('util')._extend;
  var watson       = require('watson-developer-cloud');
  var env          = require('node-env-file');

  // Bootstrap application settings
  require('./config/express')(app);

  // Load .env environmental variables
  env(__dirname + '/.env', { raise: false });

  var alchemyApiCredentials = vcapServices.getCredentials('alchemy_api');

  // For local development, replace username and password
  var speechToTextConfig = extend({
    version: 'v1',
    url: 'https://stream.watsonplatform.net/speech-to-text/api',
    username: process.env.USERNAME || '<username>',
    password: process.env.PASSWORD || '<password>'
  }, vcapServices.getCredentials('speech_to_text'));

  var alchemyConfig = extend({
    api_key: process.env.ALCHEMY_API_KEY || '<api_key>'
  }, vcapServices.getCredentials('alchemy_api'));

  var authService = watson.authorization(speechToTextConfig);

  var alchemyLanguage = watson.alchemy_language(alchemyConfig);
  ```

Notice that we have renamed the `config` object to `speechToTextConfig`. We need to update the express API endpoint `/api/token` (which exposes an endpoint that allows the javascript app to request a temporary Speech To Text token) in the `app.js` to use the updated name:
  ```js
  // Get token using your speech-to-text credentials
  app.post('/api/token', function(req, res, next) {
    authService.getToken({url: speechToTextConfig.url}, function(err, token) {
      if (err)
        next(err);
      else
        res.send(token);
    });
  });
  ```

## Adding an Alchemy API proxy
We also need to create an API interface to proxy Alchemy API requests from our javascript app to the Alchemy API relations API so that our credentials are not visible and more secure. Update the `app.js` file to expose a new endpoint:
  ```js
  // User our secret API key to proxy request to the alchemy-keywords API
  app.post('/api/alchemy-relations', function(req, res, next) {
    alchemyLanguage.relations(req.body, function(err, response) {
      if (err) {
        next(err);
      } else {
        res.send(response);
      }
    });
  });
  ```

## Communicating with the Alchemy API proxy
Now that we have an API endpoint to proxy Alchemy relations API requests, lets update the `src/utils.js` file so it can be consumed:
  ```js
  exports.createAlchemyProxy = function() {
    return {
      getAlchemyRelations: function(text, callback) {
        var url = '/api/alchemy-relations';
        var relationsRequest = new XMLHttpRequest();

        relationsRequest.open('POST', url, true);
        relationsRequest.setRequestHeader('csrf-token', $('meta[name="ct"]').attr('content'));
        relationsRequest.setRequestHeader('Content-type', 'application/json');

        relationsRequest.onreadystatechange = function() {
          if (relationsRequest.readyState !== 4) {
            return;
          }

          if (relationsRequest.status === 200) {
            var resp = JSON.parse(relationsRequest.responseText);
            callback(null, resp);
          } else {
            var error = 'Cannot reach server';
            if (relationsRequest.responseText) {
              try {
                error = JSON.parse(relationsRequest.responseText);
              } catch (e) {
                error = relationsRequest.responseText;
              }
            }

            callback(error);
          }
        };

        relationsRequest.send(JSON.stringify({ text: text }));
      }
    };
  };
  ```

Now, the Alchemy API proxy can be created and used like so:
  ```js
  var utils = require('./utils');
  var alchemyProxy = utils.createAlchemyProxy();

  alchemyProxy.getAlchemyRelations(
    "Move Marvin to the left side of the screen.",
    function(err, json) {
      // Do something with relation results
    }
  );
  ```

## Creating the Game
To create the game, we are going to stand on the shoulders of giants and use the [Phaser][phaser] game engine to make our work easier. [Download the current version][phaser-stable-download] and save it to `public/js/phaser.min.js` then include it in the webpage by adding it to the bottom of the `views/index.ejs` file:
```html
<script src="https://code.jquery.com/jquery-1.11.3.min.js"></script>
<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/js/bootstrap.min.js"></script>

<!-- Place js/phaser.min.js here at the end of the document just before we load our app code -->
<script src="js/phaser.min.js"></script>
<script src="js/index.js"></script>
```

Now create `src/views/game.js` which will house the core game code. Working with the Phaser framework is quite simple at its core, and the speech-to-text game can be essentially composed of 3 functions: `preload`, `create`, and `update`. `preload` is used to load assets such as images and sprites used in the game, `create` is for setting up the game, and `update` for detecting button presses and collisions. Start by creating a function to load setup the game:
  ```js
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
    var cursors;
    var level = 1;
    var levelString;
    var levelText;

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

      //  The current level
      levelString = 'Level : ';
      levelText = game.add.text(10, 10, levelString + level, { font: '34px Arial', fill: '#fff' });

      houses.setAll('body.immovable', true);

      cursors = game.input.keyboard.createCursorKeys();
      toggleRecordSpeechCommandButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
    }

    function update() {

    }

    function render() {

    }

    return game;
  }

  exports.initGame = initGame;
  ```
As you can seeOn the line containing `game = new Phaser.Game(750, 300, Phaser.AUTO, 'example-game', { preload: preload, create: create, update: update, render: render });`, take note of the string `example-game`. This is the name of html element id that will be the container for the game. Now, open up `views/index.ejs` again and add the element to the html: `<div id="example-game"></div>`. Then, update `src/views/index.js` to initialize the game using the `initGame` function exported from `src/views/game.js`:
  ```js
  var initSessionPermissions = require('./sessionpermissions').initSessionPermissions;
  var initAnimatePanel = require('./animatepanel').initAnimatePanel;
  var initShowTab = require('./showtab').initShowTab;
  var initDragDrop = require('./dragdrop').initDragDrop;
  var initPlaySample = require('./playsample').initPlaySample;
  var initRecordButton = require('./recordbutton').initRecordButton;
  var initFileUpload = require('./fileupload').initFileUpload;
  var initDisplayMetadata = require('./displaymetadata').initDisplayMetadata;
  var initGame = require('./game').initGame;
  ```

Now that the game is setup, the application can be built by running `$ npm build` from the command line, then ran by running `$ npm start` from the command line. Loading the page in a browser should display the character and a house inside of the element `#example-game` as shown in the screenshot below:


[speech-to-text-nodejs]: https://github.com/watson-developer-cloud/speech-to-text-nodejs
[speech-to-text-nodejs-zip]: https://github.com/watson-developer-cloud/speech-to-text-nodejs/archive/master.zip
[speech-to-text-docs]: [http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/speech-to-text.html]
[alchemy-api]: [http://www.alchemyapi.com/developers/getting-started-guide]
[bluemix-registration]: [https://console.ng.bluemix.net/registration]
[cloud-foundry]: [https://github.com/cloudfoundry/cli/releases]

[javascript-wiki]: [https://en.wikipedia.org/wiki/JavaScript]
[npm-js]: [https://www.npmjs.com/]
[node-js]: [https://nodejs.org/en/]
[phaser]: [http://phaser.io/]
[phaser-stable-download]: [https://github.com/photonstorm/phaser/releases/download/v2.4.4/phaser.min.js]
