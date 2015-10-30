A Speech Controlled Game
=========================

In this article, we will be modifying the [Speech To Text Node.js sample application][speech-to-text-nodejs] from IBM Watson Tradeoff Analytics, and customizing it to build a speech controlled game. We will use the [IBM Watson Speech To Text service][speech-to-text-docs] to convert human audio voice into text, and the [Alchemy API Relation Extraction service][alchemy-api] to extract relations from the text. For this example, we are going to create a game that listens for voice commands, and uses these commands to control a character in the game. Melvin -- the main character -- will be able to walk toward a house, destroy it, and level up.


For this example, we will process audio microphone inputs from the browser into text, then send the text to the [Alchemy API][alchemy-api] for text relation extraction. After the audio input has been converted into Subject-Action-Object relations, we will then parse these relations and invoke associate game commands.

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
 1. Create a Bluemix Account
    [Sign up][bluemix-registration] for Bluemix, or use an existing account. Watson Services in Beta are free to use.

 1. Download and install the [Cloud-foundry CLI][cloud-foundry] tool

 1. Connect to Bluemix in the command line tool.
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
For local development, we want to be able to store credentials locally, but keep them out of our repository and possibly use different credentials in production. A common solution for this problem is to store all credentials inside of a file called `.env` and have the application read and use these values when defined. Thankfully, there is already a node library that has been built that does most of the work called `node-env-file`. Lets add this library dependency to our application:
  ```sh
  npm install --save node-env-file
  ```
Next lets add our credentials:

  `.env:`
  ```sh
  USERNAME=[your-speech-to-text-username-goes-here]
  PASSWORD=[your-speech-to-text-password-goes-here]
  ALCHEMY_API_KEY=[your-alchemy-api-key-goes-here]
  ```


[speech-to-text-nodejs]: https://github.com/watson-developer-cloud/speech-to-text-nodejs
[speech-to-text-nodejs-zip]: https://github.com/watson-developer-cloud/speech-to-text-nodejs/archive/master.zip
[speech-to-text-docs]: [http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/speech-to-text.html]
[alchemy-api]: [http://www.alchemyapi.com/developers/getting-started-guide]
[bluemix-registration]: [https://console.ng.bluemix.net/registration]
[cloud-foundry]: [https://github.com/cloudfoundry/cli/releases]

[javascript-wiki]: [https://en.wikipedia.org/wiki/JavaScript]
[npm-js]: [https://www.npmjs.com/]
[node-js]: [https://nodejs.org/en/]
