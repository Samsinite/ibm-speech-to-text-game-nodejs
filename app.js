/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

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

var speechToTextAuthService = watson.authorization(speechToTextConfig);

var alchemyLanguage = watson.alchemy_language(alchemyConfig);

app.get('/', function(req, res) {
  res.render('index', { ct: req._csrfToken });
});

// Get token using your speech-to-text credentials
app.post('/api/speech-to-text-token', function(req, res, next) {
  speechToTextAuthService.getToken({url: speechToTextConfig.url}, function(err, token) {
    if (err)
      next(err);
    else
      res.send(token);
  });
});

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

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
