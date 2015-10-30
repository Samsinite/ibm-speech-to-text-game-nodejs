(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global OfflineAudioContext */
'use strict';

var utils = require('./utils');
/**
 * Captures microphone input from the browser.
 * Works at least on latest versions of Firefox and Chrome
 */
function Microphone(_options) {
  var options = _options || {};

  // we record in mono because the speech recognition service
  // does not support stereo.
  this.bufferSize = options.bufferSize || 8192;
  this.inputChannels = options.inputChannels || 1;
  this.outputChannels = options.outputChannels || 1;
  this.recording = false;
  this.requestedAccess = false;
  this.sampleRate = 16000;
  // auxiliar buffer to keep unused samples (used when doing downsampling)
  this.bufferUnusedSamples = new Float32Array(0);

  // Chrome or Firefox or IE User media
  if (!navigator.getUserMedia) {
    navigator.getUserMedia = navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
  }

}

/**
 * Called when the user reject the use of the michrophone
 * @param  error The error
 */
Microphone.prototype.onPermissionRejected = function() {
  console.log('Microphone.onPermissionRejected()');
  this.requestedAccess = false;
  this.onError('Permission to access the microphone rejeted.');
};

Microphone.prototype.onError = function(error) {
  console.log('Microphone.onError():', error);
};

/**
 * Called when the user authorizes the use of the microphone.
 * @param  {Object} stream The Stream to connect to
 *
 */
Microphone.prototype.onMediaStream =  function(stream) {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;

  if (!AudioCtx)
    throw new Error('AudioContext not available');

  if (!this.audioContext)
    this.audioContext = new AudioCtx();

  var gain = this.audioContext.createGain();
  var audioInput = this.audioContext.createMediaStreamSource(stream);

  audioInput.connect(gain);

  this.mic = this.audioContext.createScriptProcessor(this.bufferSize,
    this.inputChannels, this.outputChannels);

  // uncomment the following line if you want to use your microphone sample rate
  //this.sampleRate = this.audioContext.sampleRate;
  console.log('Microphone.onMediaStream(): sampling rate is:', this.sampleRate);

  this.mic.onaudioprocess = this._onaudioprocess.bind(this);
  this.stream = stream;

  gain.connect(this.mic);
  this.mic.connect(this.audioContext.destination);
  this.recording = true;
  this.requestedAccess = false;
  this.onStartRecording();
};

/**
 * callback that is being used by the microphone
 * to send audio chunks.
 * @param  {object} data audio
 */
Microphone.prototype._onaudioprocess = function(data) {
  if (!this.recording) {
    // We speak but we are not recording
    return;
  }

  // Single channel
  var chan = data.inputBuffer.getChannelData(0);

  //resampler(this.audioContext.sampleRate,data.inputBuffer,this.onAudio);

  this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)));

  //export with microphone mhz, remember to update the this.sampleRate
  // with the sample rate from your microphone
  // this.onAudio(this._exportDataBuffer(new Float32Array(chan)));

};

/**
 * Start the audio recording
 */
Microphone.prototype.record = function() {
  if (!navigator.getUserMedia){
    this.onError('Browser doesn\'t support microphone input');
    return;
  }
  if (this.requestedAccess) {
    return;
  }

  this.requestedAccess = true;
  navigator.getUserMedia({ audio: true },
    this.onMediaStream.bind(this), // Microphone permission granted
    this.onPermissionRejected.bind(this)); // Microphone permission rejected
};

/**
 * Stop the audio recording
 */
Microphone.prototype.stop = function() {
  if (!this.recording)
    return;
  this.recording = false;
  this.stream.getTracks()[0].stop();
  this.requestedAccess = false;
  this.mic.disconnect(0);
  this.mic = null;
  this.onStopRecording();
};

/**
 * Creates a Blob type: 'audio/l16' with the chunk and downsampling to 16 kHz
 * coming from the microphone.
 * Explanation for the math: The raw values captured from the Web Audio API are
 * in 32-bit Floating Point, between -1 and 1 (per the specification).
 * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
 * Multiply to control the volume of the output. We store in little endian.
 * @param  {Object} buffer Microphone audio chunk
 * @return {Blob} 'audio/l16' chunk
 * @deprecated This method is depracated
 */
Microphone.prototype._exportDataBufferTo16Khz = function(bufferNewSamples) {
  var buffer = null,
    newSamples = bufferNewSamples.length,
    unusedSamples = this.bufferUnusedSamples.length;


  if (unusedSamples > 0) {
    buffer = new Float32Array(unusedSamples + newSamples);
    for (var i = 0; i < unusedSamples; ++i) {
      buffer[i] = this.bufferUnusedSamples[i];
    }
    for (i = 0; i < newSamples; ++i) {
      buffer[unusedSamples + i] = bufferNewSamples[i];
    }
  } else {
    buffer = bufferNewSamples;
  }

  // downsampling variables
  var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
      -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
      -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
    ],
    samplingRateRatio = this.audioContext.sampleRate / 16000,
    nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1,
    pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
    dataView16k = new DataView(pcmEncodedBuffer16k),
    index = 0,
    volume = 0x7FFF, //range from 0 to 0x7FFF to control the volume
    nOut = 0;

  for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
    var sample = 0;
    for (var j = 0; j < filter.length; ++j) {
      sample += buffer[i + j] * filter[j];
    }
    sample *= volume;
    dataView16k.setInt16(index, sample, true); // 'true' -> means little endian
    index += 2;
    nOut++;
  }

  var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
  var remaining = buffer.length - indexSampleAfterLastUsed;
  if (remaining > 0) {
    this.bufferUnusedSamples = new Float32Array(remaining);
    for (i = 0; i < remaining; ++i) {
      this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
    }
  } else {
    this.bufferUnusedSamples = new Float32Array(0);
  }

  return new Blob([dataView16k], {
    type: 'audio/l16'
  });
  };



// native way of resampling captured audio
var resampler = function(sampleRate, audioBuffer, callbackProcessAudio) {

  console.log('length: ' + audioBuffer.length + ' ' + sampleRate);
  var channels = 1;
  var targetSampleRate = 16000;
  var numSamplesTarget = audioBuffer.length * targetSampleRate / sampleRate;

  var offlineContext = new OfflineAudioContext(channels, numSamplesTarget, targetSampleRate);
  var bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;

  // callback that is called when the resampling finishes
  offlineContext.oncomplete = function(event) {
    var samplesTarget = event.renderedBuffer.getChannelData(0);
    console.log('Done resampling: ' + samplesTarget.length + ' samples produced');

  // convert from [-1,1] range of floating point numbers to [-32767,32767] range of integers
  var index = 0;
  var volume = 0x7FFF;
    var pcmEncodedBuffer = new ArrayBuffer(samplesTarget.length*2);    // short integer to byte
    var dataView = new DataView(pcmEncodedBuffer);
    for (var i = 0; i < samplesTarget.length; i++) {
      dataView.setInt16(index, samplesTarget[i]*volume, true);
      index += 2;
    }

    // l16 is the MIME type for 16-bit PCM
    callbackProcessAudio(new Blob([dataView], { type: 'audio/l16' }));
  };

  bufferSource.connect(offlineContext.destination);
  bufferSource.start(0);
  offlineContext.startRendering();
};



/**
 * Creates a Blob type: 'audio/l16' with the
 * chunk coming from the microphone.
 */
var exportDataBuffer = function(buffer, bufferSize) {
  var pcmEncodedBuffer = null,
    dataView = null,
    index = 0,
    volume = 0x7FFF; //range from 0 to 0x7FFF to control the volume

  pcmEncodedBuffer = new ArrayBuffer(bufferSize * 2);
  dataView = new DataView(pcmEncodedBuffer);

  /* Explanation for the math: The raw values captured from the Web Audio API are
   * in 32-bit Floating Point, between -1 and 1 (per the specification).
   * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
   * Multiply to control the volume of the output. We store in little endian.
   */
  for (var i = 0; i < buffer.length; i++) {
    dataView.setInt16(index, buffer[i] * volume, true);
    index += 2;
  }

  // l16 is the MIME type for 16-bit PCM
  return new Blob([dataView], { type: 'audio/l16' });
};

Microphone.prototype._exportDataBuffer = function(buffer){
  utils.exportDataBuffer(buffer, this.bufferSize);
};


// Functions used to control Microphone events listeners.
Microphone.prototype.onStartRecording =  function() {};
Microphone.prototype.onStopRecording =  function() {};
Microphone.prototype.onAudio =  function() {};

module.exports = Microphone;
},{"./utils":8}],2:[function(require,module,exports){
module.exports={
   "models": [
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_BroadbandModel",
         "rate": 16000,
         "name": "en-US_BroadbandModel",
         "language": "en-US",
         "description": "US English broadband model (16KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_NarrowbandModel",
         "rate": 8000,
         "name": "en-US_NarrowbandModel",
         "language": "en-US",
         "description": "US English narrowband model (8KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_BroadbandModel",
         "rate": 16000,
         "name": "es-ES_BroadbandModel",
         "language": "es-ES",
         "description": "Spanish broadband model (16KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_NarrowbandModel",
         "rate": 8000,
         "name": "es-ES_NarrowbandModel",
         "language": "es-ES",
         "description": "Spanish narrowband model (8KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_BroadbandModel",
         "rate": 16000,
         "name": "pt-BR_BroadbandModel",
         "language": "pt-BR",
         "description": "Brazilian Portuguese broadband model (16KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_NarrowbandModel",
         "rate": 8000,
         "name": "pt-BR_NarrowbandModel",
         "language": "pt-BR",
         "description": "Brazilian Portuguese narrowband model (8KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_BroadbandModel",
         "rate": 16000,
         "name": "zh-CN_BroadbandModel",
         "language": "zh-CN",
         "description": "Mandarin broadband model (16KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_NarrowbandModel",
         "rate": 8000,
         "name": "zh-CN_NarrowbandModel",
         "language": "zh-CN",
         "description": "Mandarin narrowband model (8KHz)"
      }
   ]
}

},{}],3:[function(require,module,exports){
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
/* global $ */
'use strict';

var display = require('./views/displaymetadata');
var initSocket = require('./socket').initSocket;

exports.handleFileUpload = function(type, token, model, file, contentType, callback, onend) {

    // Set currentlyDisplaying to prevent other sockets from opening
    localStorage.setItem('currentlyDisplaying', type);

    // $('#progressIndicator').css('visibility', 'visible');

    $.subscribe('progress', function(evt, data) {
      console.log('progress: ', data);
    });

    console.log('contentType', contentType);

    var baseString = '';
    var baseJSON = '';

    $.subscribe('showjson', function() {
      var $resultsJSON = $('#resultsJSON');
      $resultsJSON.empty();
      $resultsJSON.append(baseJSON);
    });

    var options = {};
    options.token = token;
    options.message = {
      'action': 'start',
      'content-type': contentType,
      'interim_results': true,
      'continuous': true,
      'word_confidence': true,
      'timestamps': true,
      'max_alternatives': 3,
      'inactivity_timeout': 600
    };
    options.model = model;

    function onOpen() {
      console.log('Socket opened');
    }

    function onListening(socket) {
      console.log('Socket listening');
      callback(socket);
    }

    function onMessage(msg) {
      if (msg.results) {
        // Convert to closure approach
        baseString = display.showResult(msg, baseString, model);
        baseJSON = display.showJSON(msg, baseJSON);
      }
    }

    function onError(evt) {
      localStorage.setItem('currentlyDisplaying', 'false');
      onend(evt);
      console.log('Socket err: ', evt.code);
    }

    function onClose(evt) {
      localStorage.setItem('currentlyDisplaying', 'false');
      onend(evt);
      console.log('Socket closing: ', evt);
    }

    initSocket(options, onOpen, onListening, onMessage, onError, onClose);
};

},{"./socket":7,"./views/displaymetadata":10}],4:[function(require,module,exports){
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
/* global $ */
'use strict';

var initSocket = require('./socket').initSocket;
var display = require('./views/displaymetadata');

exports.handleMicrophone = function(token, model, mic, callback) {
  if (model.indexOf('Narrowband') > -1) {
    var err = new Error('Microphone transcription cannot accomodate narrowband models, '+
      'please select another');
    callback(err, null);
    return false;
  }

  $.publish('clearscreen');

  // Test out websocket
  var baseString = '';
  var baseJSON = '';

  $.subscribe('showjson', function() {
    var $resultsJSON = $('#resultsJSON');
    $resultsJSON.empty();
    $resultsJSON.append(baseJSON);
  });

  var options = {};
  options.token = token;
  options.message = {
    'action': 'start',
    'content-type': 'audio/l16;rate=16000',
    'interim_results': true,
    'continuous': true,
    'word_confidence': true,
    'timestamps': true,
    'max_alternatives': 3,
    'inactivity_timeout': 600
  };
  options.model = model;

  function onOpen(socket) {
    console.log('Mic socket: opened');
    callback(null, socket);
  }

  function onListening(socket) {

    mic.onAudio = function(blob) {
      if (socket.readyState < 2) {
        socket.send(blob);
      }
    };
  }

  function onMessage(msg) {
    if (msg.results) {
      baseString = display.showResult(msg, baseString, model);
      baseJSON = display.showJSON(msg, baseJSON);
    }
  }

  function onError() {
    console.log('Mic socket err: ', err);
  }

  function onClose(evt) {
    console.log('Mic socket close: ', evt);
  }

  initSocket(options, onOpen, onListening, onMessage, onError, onClose);
};

},{"./socket":7,"./views/displaymetadata":10}],5:[function(require,module,exports){
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
/*global $:false, BUFFERSIZE */

'use strict';

var models = require('./data/models.json').models;
var utils = require('./utils');
utils.initPubSub();
var initViews = require('./views').initViews;
var showerror = require('./views/showerror');
var showError = showerror.showError;
var getModels = require('./models').getModels;

window.BUFFERSIZE = 8192;

$(document).ready(function() {
  var tokenGenerator = utils.createTokenGenerator();
  var alchemyProxy = utils.createAlchemyProxy();

  alchemyProxy.getAlchemyRelations(
    "Move the fairy to the left side of the screen.",
    function(err, json) {
      console.log(json);
    }
  )

  // Make call to API to try and get tokens
  tokenGenerator.getSpeechToTextToken(function(err, token) {
    window.onbeforeunload = function() {
      localStorage.clear();
    };

    if (!token) {
      console.error('No speech-to-text authorization token available');
      console.error('Attempting to reconnect...');

      if (err && err.code)
        showError('Server error ' + err.code + ': '+ err.error);
      else
        showError('Server error ' + err.code + ': please refresh your browser and try again');
    }

    var viewContext = {
      currentModel: 'en-US_BroadbandModel',
      models: models,
      token: token,
      alchemyProxy: alchemyProxy,
      bufferSize: BUFFERSIZE
    };

    initViews(viewContext);

    // Save models to localstorage
    localStorage.setItem('models', JSON.stringify(models));

    // Set default current model
    localStorage.setItem('currentModel', 'en-US_BroadbandModel');
    localStorage.setItem('sessionPermissions', 'true');

    getModels(token);

    $.subscribe('clearscreen', function() {
      $('#resultsText').text('');
      $('#resultsJSON').text('');
      $('.error-row').hide();
      $('.notification-row').hide();
      $('.hypotheses > ul').empty();
      $('#metadataTableBody').empty();
    });

  });

});

},{"./data/models.json":2,"./models":6,"./utils":8,"./views":15,"./views/showerror":20}],6:[function(require,module,exports){
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
var selectModel = require('./views/selectmodel').initSelectModel;

exports.getModels = function(token) {
  var viewContext = {
    currentModel: 'en-US_BroadbandModel',
    models: null,
    token: token,
    bufferSize: BUFFERSIZE
  };
  var modelUrl = 'https://stream.watsonplatform.net/speech-to-text/api/v1/models';
  var sttRequest = new XMLHttpRequest();
  sttRequest.open('GET', modelUrl, true);
  sttRequest.withCredentials = true;
  sttRequest.setRequestHeader('Accept', 'application/json');
  sttRequest.setRequestHeader('X-Watson-Authorization-Token', token);
  sttRequest.onload = function() {
    var response = JSON.parse(sttRequest.responseText);
    var sorted = response.models.sort(function(a,b) {
    if(a.name > b.name) {
      return 1;
    }
    if( a.name < b.name) {
      return -1;
    }
    return 0;
    });
    response.models=sorted;
    localStorage.setItem('models', JSON.stringify(response.models));
    viewContext.models = response.models;
    selectModel(viewContext);
  };
  sttRequest.onerror = function() {
    viewContext.models = require('./data/models.json').models;
    selectModel(viewContext);
  };
  sttRequest.send();
};

},{"./data/models.json":2,"./views/selectmodel":18}],7:[function(require,module,exports){
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
/*global $:false */

'use strict';

var utils = require('./utils');
var showerror = require('./views/showerror');
var showError = showerror.showError;

// Mini WS callback API, so we can initialize
// with model and token in URI, plus
// start message

// Initialize closure, which holds maximum getToken call count
var tokenGenerator = utils.createTokenGenerator();

var initSocket = exports.initSocket = function(options, onopen, onlistening, onmessage, onerror, onclose) {
  var listening;
  function withDefault(val, defaultVal) {
    return typeof val === 'undefined' ? defaultVal : val;
  }
  var socket;
  var token = options.token;
  var model = options.model || localStorage.getItem('currentModel');
  var message = options.message || {'action': 'start'};
  var sessionPermissions = withDefault(options.sessionPermissions,
    JSON.parse(localStorage.getItem('sessionPermissions')));
  var sessionPermissionsQueryParam = sessionPermissions ? '0' : '1';
  var url = options.serviceURI || 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=';
    url+= token + '&X-WDC-PL-OPT-OUT=' + sessionPermissionsQueryParam + '&model=' + model;
  console.log('URL model', model);
  try {
    socket = new WebSocket(url);
  } catch(err) {
    console.error('WS connection error: ', err);
  }
  socket.onopen = function() {
    listening = false;
    $.subscribe('hardsocketstop', function() {
      console.log('MICROPHONE: close.');
      socket.send(JSON.stringify({action:'stop'}));
      socket.close();
    });
    $.subscribe('socketstop', function() {
      console.log('MICROPHONE: close.');
      socket.close();
    });
    socket.send(JSON.stringify(message));
    onopen(socket);
  };
  socket.onmessage = function(evt) {
    var msg = JSON.parse(evt.data);
    if (msg.error) {
      showError(msg.error);
      $.publish('hardsocketstop');
      return;
    }
    if (msg.state === 'listening') {
      // Early cut off, without notification
      if (!listening) {
        onlistening(socket);
        listening = true;
      } else {
        console.log('MICROPHONE: Closing socket.');
        socket.close();
      }
    }
    onmessage(msg, socket);
  };

  socket.onerror = function(evt) {
    console.log('WS onerror: ', evt);
    showError('Application error ' + evt.code + ': please refresh your browser and try again');
    $.publish('clearscreen');
    onerror(evt);
  };

  socket.onclose = function(evt) {
    console.log('WS onclose: ', evt);
    if (evt.code === 1006) {
      // Authentication error, try to reconnect
      console.log('generator count', tokenGenerator.getSpeechToTextCount());
      if (tokenGenerator.getSpeechToTextCount() > 1) {
        $.publish('hardsocketstop');
        throw new Error('No authorization token is currently available');
      }
      tokenGenerator.getToken(function(err, token) {
        if (err) {
          $.publish('hardsocketstop');
          return false;
        }
        console.log('Fetching additional token...');
        options.token = token;
        initSocket(options, onopen, onlistening, onmessage, onerror, onclose);
      });
      return false;
    }
    if (evt.code === 1011) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    if (evt.code > 1000) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    // Made it through, normal close
    $.unsubscribe('hardsocketstop');
    $.unsubscribe('socketstop');
    onclose(evt);
  };

};

},{"./utils":8,"./views/showerror":20}],8:[function(require,module,exports){
(function (global){
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

// For non-view logic
var $ = (typeof window !== "undefined" ? window['jQuery'] : typeof global !== "undefined" ? global['jQuery'] : null);

var fileBlock = function(_offset, length, _file, readChunk) {
  var r = new FileReader();
  var blob = _file.slice(_offset, length + _offset);
  r.onload = readChunk;
  r.readAsArrayBuffer(blob);
};

// Based on alediaferia's SO response
// http://stackoverflow.com/questions/14438187/javascript-filereader-parsing-long-file-in-chunks
exports.onFileProgress = function(options, ondata, running, onerror, onend, samplingRate) {
  var file       = options.file;
  var fileSize   = file.size;
  var chunkSize  = options.bufferSize || 16000;  // in bytes
  var offset     = 0;
  var readChunk = function(evt) {
    if (offset >= fileSize) {
      console.log('Done reading file');
      onend();
      return;
    }
    if(!running()) {
      return;
    }
    if (evt.target.error == null) {
      var buffer = evt.target.result;
      var len = buffer.byteLength;
      offset += len;
      //console.log('sending: ' + len);
      ondata(buffer); // callback for handling read chunk
    } else {
      var errorMessage = evt.target.error;
      console.log('Read error: ' + errorMessage);
      onerror(errorMessage);
      return;
    }
    // use this timeout to pace the data upload for the playSample case,
    // the idea is that the hyps do not arrive before the audio is played back
    if (samplingRate) {
    	// console.log('samplingRate: ' +
      //  samplingRate + ' timeout: ' + (chunkSize * 1000) / (samplingRate * 2));
    	setTimeout(function() {
    	  fileBlock(offset, chunkSize, file, readChunk);
    	}, (chunkSize * 1000) / (samplingRate * 2));
    } else {
      fileBlock(offset, chunkSize, file, readChunk);
    }
  };
  fileBlock(offset, chunkSize, file, readChunk);
};

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

exports.createTokenGenerator = function() {
  // Make call to API to try and get token
  var _speechToTextHasBeenRunTimes = 0;
  return {
    getSpeechToTextToken: function(callback) {
      ++_speechToTextHasBeenRunTimes;
      if (_speechToTextHasBeenRunTimes > 5) {
        var err = new Error('Cannot reach server');
        callback(null, err);
        return;
      }
      var url = '/api/speech-to-text-token';
      var tokenRequest = new XMLHttpRequest();
      tokenRequest.open('POST', url, true);
      tokenRequest.setRequestHeader('csrf-token',$('meta[name="ct"]').attr('content'));
      tokenRequest.onreadystatechange = function() {
        if (tokenRequest.readyState === 4) {
          if (tokenRequest.status === 200) {
            var token = tokenRequest.responseText;
            callback(null, token);
          } else {
            var error = 'Cannot reach server';
            if (tokenRequest.responseText){
              try {
                error = JSON.parse(tokenRequest.responseText);
              } catch (e) {
                error = tokenRequest.responseText;
              }
            }
            callback(error);
          }
        }
      };
      tokenRequest.send();
    },
    getSpeechToTextCount: function() { return _speechToTextHasBeenRunTimes; }
  };
};

exports.initPubSub = function() {
  var o         = $({});
  $.subscribe   = o.on.bind(o);
  $.unsubscribe = o.off.bind(o);
  $.publish     = o.trigger.bind(o);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],9:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';


exports.initAnimatePanel = function() {
  $('.panel-heading span.clickable').on('click', function () {
    if ($(this).hasClass('panel-collapsed')) {
      // expand the panel
      $(this).parents('.panel').find('.panel-body').slideDown();
      $(this).removeClass('panel-collapsed');
      $(this).find('i').removeClass('caret-down').addClass('caret-up');
    }
    else {
      // collapse the panel
      $(this).parents('.panel').find('.panel-body').slideUp();
      $(this).addClass('panel-collapsed');
      $(this).find('i').removeClass('caret-up').addClass('caret-down');
    }
  });
};

},{}],10:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var scrolled = false,
    textScrolled = false;

var showTimestamp = function(timestamps, confidences) {
  var word = timestamps[0],
      t0 = timestamps[1],
      t1 = timestamps[2];

  // Show confidence if defined, else 'n/a'
  var displayConfidence = confidences ? confidences[1].toString().substring(0, 3) : 'n/a';
  $('#metadataTable > tbody:last-child').append(
      '<tr>'
      + '<td>' + word + '</td>'
      + '<td>' + t0 + '</td>'
      + '<td>' + t1 + '</td>'
      + '<td>' + displayConfidence + '</td>'
      + '</tr>'
      );
};


var showMetaData = function(alternative) {
  var confidenceNestedArray = alternative.word_confidence;
  var timestampNestedArray = alternative.timestamps;
  if (confidenceNestedArray && confidenceNestedArray.length > 0) {
    for (var i = 0; i < confidenceNestedArray.length; i++) {
      var timestamps = timestampNestedArray[i];
      var confidences = confidenceNestedArray[i];
      showTimestamp(timestamps, confidences);
    }
    return;
  } else {
    if (timestampNestedArray && timestampNestedArray.length > 0) {
      timestampNestedArray.forEach(function(timestamp) {
        showTimestamp(timestamp);
      });
    }
  }
};

var Alternatives = function(){

  var stringOne = '',
    stringTwo = '',
    stringThree = '';

  this.clearString = function() {
    stringOne = '';
    stringTwo = '';
    stringThree = '';
  };

  this.showAlternatives = function(alternatives, isFinal, testing) {
    var $hypotheses = $('.hypotheses ol');
    $hypotheses.empty();
    // $hypotheses.append($('</br>'));
    alternatives.forEach(function(alternative, idx) {
      var $alternative;
      if (alternative.transcript) {
        var transcript = alternative.transcript.replace(/%HESITATION\s/g, '');
        transcript = transcript.replace(/(.)\1{2,}/g, '');
        switch (idx) {
          case 0:
            stringOne = stringOne + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringOne + '</li>');
            break;
          case 1:
            stringTwo = stringTwo + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringTwo + '</li>');
            break;
          case 2:
            stringThree = stringThree + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringThree + '</li>');
            break;
        }
        $hypotheses.append($alternative);
      }
    });
  };
};

var alternativePrototype = new Alternatives();

exports.showJSON = function(msg, baseJSON) {

   var json = JSON.stringify(msg, null, 2);
    baseJSON += json;
    baseJSON += '\n';

  if ($('.nav-tabs .active').text() === 'JSON') {
      $('#resultsJSON').append(baseJSON);
      baseJSON = '';
      console.log('updating json');
  }

  return baseJSON;
};

function updateTextScroll(){
  if(!scrolled){
    var element = $('#resultsText').get(0);
    element.scrollTop = element.scrollHeight;
  }
}

var initTextScroll = function() {
  $('#resultsText').on('scroll', function(){
      textScrolled = true;
  });
};

function updateScroll(){
  if(!scrolled){
    var element = $('.table-scroll').get(0);
    element.scrollTop = element.scrollHeight;
  }
}

var initScroll = function() {
  $('.table-scroll').on('scroll', function(){
      scrolled=true;
  });
};

exports.initDisplayMetadata = function() {
  initScroll();
  initTextScroll();
};


exports.showResult = function(msg, baseString, model) {
  if (msg.results && msg.results.length > 0) {

    var alternatives = msg.results[0].alternatives;
    var text = msg.results[0].alternatives[0].transcript || '';

    // apply mappings to beautify
    text = text.replace(/%HESITATION\s/g, '');
    text = text.replace(/(.)\1{2,}/g, '');
    if (msg.results[0].final)
       console.log('-> ' + text);
    text = text.replace(/D_[^\s]+/g,'');

    // if all words are mapped to nothing then there is nothing else to do
    if ((text.length === 0) || (/^\s+$/.test(text))) {
    	 return baseString;
    }

    // capitalize first word
    // if final results, append a new paragraph
    if (msg.results && msg.results[0] && msg.results[0].final) {
       text = text.slice(0, -1);
       text = text.charAt(0).toUpperCase() + text.substring(1);
        text = text.trim() + '. ';
       baseString += text;
       $('#resultsText').val(baseString);
       showMetaData(alternatives[0]);
       // Only show alternatives if we're final
       alternativePrototype.showAlternatives(alternatives);
    } else {
      //text = text.replace(/ /g,'');      // remove whitespaces
      text = text.charAt(0).toUpperCase() + text.substring(1);
      $('#resultsText').val(baseString + text);
    }
  }

  updateScroll();
  updateTextScroll();
  return baseString;
};

$.subscribe('clearscreen', function() {
  var $hypotheses = $('.hypotheses ul');
  scrolled = false;
  $hypotheses.empty();
  alternativePrototype.clearString();
});

},{}],11:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var handleSelectedFile = require('./fileupload').handleSelectedFile;

exports.initDragDrop = function(ctx) {

  var dragAndDropTarget = $(document);

  dragAndDropTarget.on('dragenter', function (e) {
    e.stopPropagation();
    e.preventDefault();
  });

  dragAndDropTarget.on('dragover', function (e) {
    e.stopPropagation();
    e.preventDefault();
  });

  dragAndDropTarget.on('drop', function (e) {
    console.log('File dropped');
    e.preventDefault();
    var evt = e.originalEvent;
    // Handle dragged file event
    handleFileUploadEvent(evt);
  });

  function handleFileUploadEvent(evt) {
    // Init file upload with default model
    var file = evt.dataTransfer.files[0];
    handleSelectedFile(ctx.token, file);
  }

};

},{"./fileupload":13}],12:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

exports.flashSVG = function(el) {
  el.css({ fill: '#A53725' });
  function loop() {
    el.animate({ fill: '#A53725' },
        1000, 'linear')
      .animate({ fill: 'white' },
          1000, 'linear');
  }
  // return timer
  var timer = setTimeout(loop, 2000);
  return timer;
};

exports.stopFlashSVG = function(timer) {
  el.css({ fill: 'white' } );
  clearInterval(timer);
};

exports.toggleImage = function(el, name) {
  if(el.attr('src') === 'images/' + name + '.svg') {
    el.attr('src', 'images/stop-red.svg');
  } else {
    el.attr('src', 'images/stop.svg');
  }
};

var restoreImage = exports.restoreImage = function(el, name) {
  el.attr('src', 'images/' + name + '.svg');
};

exports.stopToggleImage = function(timer, el, name) {
  clearInterval(timer);
  restoreImage(el, name);
};

},{}],13:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var showError = require('./showerror').showError;
var showNotice = require('./showerror').showNotice;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var effects = require('./effects');
var utils = require('../utils');

// Need to remove the view logic here and move this out to the handlefileupload controller
var handleSelectedFile = exports.handleSelectedFile = (function() {

    var running = false;
    localStorage.setItem('currentlyDisplaying', 'false');

    return function(token, file) {

    $.publish('clearscreen');

    
    localStorage.setItem('currentlyDisplaying', 'fileupload');
    running = true;

    // Visual effects
    var uploadImageTag = $('#fileUploadTarget > img');
    var timer = setInterval(effects.toggleImage, 750, uploadImageTag, 'stop');
    var uploadText = $('#fileUploadTarget > span');
    uploadText.text('Stop Transcribing');

    function restoreUploadTab() {
      clearInterval(timer);
      effects.restoreImage(uploadImageTag, 'upload');
      uploadText.text('Select File');
    }

    // Clear flashing if socket upload is stopped
    $.subscribe('hardsocketstop', function() {
      restoreUploadTab();
      running = false;
    });

    // Get current model
    var currentModel = localStorage.getItem('currentModel');
    console.log('currentModel', currentModel);

    // Read first 4 bytes to determine header
    var blobToText = new Blob([file]).slice(0, 4);
    var r = new FileReader();
    r.readAsText(blobToText);
    r.onload = function() {
      var contentType;
      if (r.result === 'fLaC') {
        contentType = 'audio/flac';
        showNotice('Notice: browsers do not support playing FLAC audio, so no audio will accompany the transcription');
      } else if (r.result === 'RIFF') {
        contentType = 'audio/wav';
        var audio = new Audio();
        var wavBlob = new Blob([file], {type: 'audio/wav'});
        var wavURL = URL.createObjectURL(wavBlob);
        audio.src = wavURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
      } else if (r.result === 'OggS') {
        contentType = 'audio/ogg; codecs=opus';
        var audio = new Audio();
        var opusBlob = new Blob([file], {type: 'audio/ogg; codecs=opus'});
        var opusURL = URL.createObjectURL(opusBlob);
        audio.src=opusURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
            audio.pause();
            audio.currentTime = 0;
        });
      } else {
        restoreUploadTab();
        showError('Only WAV or FLAC or Opus files can be transcribed, please try another file format');
        localStorage.setItem('currentlyDisplaying', 'false');
        return;
      }
      handleFileUpload('fileupload', token, currentModel, file, contentType, function(socket) {
        var blob = new Blob([file]);
        var parseOptions = {
          file: blob
        };
        utils.onFileProgress(parseOptions,
          // On data chunk
          function onData(chunk) {
            socket.send(chunk);
          },
          function isRunning() {
            if(running)
                return true;
            else
                return false;
          },
          // On file read error
          function(evt) {
            console.log('Error reading file: ', evt.message);
            showError('Error: ' + evt.message);
          },
          // On load end
          function() {
            socket.send(JSON.stringify({'action': 'stop'}));
          });
      },
        function() {
          effects.stopToggleImage(timer, uploadImageTag, 'upload');
          uploadText.text('Select File');
          localStorage.setItem('currentlyDisplaying', 'false');
        }
      );
    };
  };
})();


exports.initFileUpload = function(ctx) {

  var fileUploadDialog = $('#fileUploadDialog');

  fileUploadDialog.change(function() {
    var file = fileUploadDialog.get(0).files[0];
    handleSelectedFile(ctx.token, file);
  });

  $('#fileUploadTarget').click(function() {

    var currentlyDisplaying = localStorage.getItem('currentlyDisplaying');

    if (currentlyDisplaying=='fileupload') {
      console.log('HARD SOCKET STOP');
      $.publish('hardsocketstop');
      localStorage.setItem('currentlyDisplaying', 'false');
      return;
    } else if (currentlyDisplaying=='sample') {
      showError('Currently another file is playing, please stop the file or wait until it finishes'); 
      return;
    } else if (currentlyDisplaying=='record') {
      showError('Currently audio is being recorded, please stop recording before playing a sample');
      return;
    }
    fileUploadDialog.val(null);

    fileUploadDialog
    .trigger('click');

  });

};

},{"../handlefileupload":3,"../utils":8,"./effects":12,"./showerror":20}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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

var initSessionPermissions = require('./sessionpermissions').initSessionPermissions;
var initAnimatePanel = require('./animatepanel').initAnimatePanel;
var initShowTab = require('./showtab').initShowTab;
var initDragDrop = require('./dragdrop').initDragDrop;
var initPlaySample = require('./playsample').initPlaySample;
var initRecordButton = require('./recordbutton').initRecordButton;
var initFileUpload = require('./fileupload').initFileUpload;
var initDisplayMetadata = require('./displaymetadata').initDisplayMetadata;
var initGame = require('./game').initGame;

exports.initViews = function(ctx) {
  console.log('Initializing views...');
  initPlaySample(ctx);
  initDragDrop(ctx);
  initRecordButton(ctx);
  initFileUpload(ctx);
  initSessionPermissions();
  initShowTab();
  initAnimatePanel();
  initShowTab();
  initDisplayMetadata();
  initGame(ctx);
};

},{"./animatepanel":9,"./displaymetadata":10,"./dragdrop":11,"./fileupload":13,"./game":14,"./playsample":16,"./recordbutton":17,"./sessionpermissions":19,"./showtab":21}],16:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var utils = require('../utils');
var onFileProgress = utils.onFileProgress;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var showError = require('./showerror').showError;
var effects = require('./effects');


var LOOKUP_TABLE = {
  'en-US_BroadbandModel': ['Us_English_Broadband_Sample_1.wav', 'Us_English_Broadband_Sample_2.wav'],
  'en-US_NarrowbandModel': ['Us_English_Narrowband_Sample_1.wav', 'Us_English_Narrowband_Sample_2.wav'],
  'es-ES_BroadbandModel': ['Es_ES_spk24_16khz.wav', 'Es_ES_spk19_16khz.wav'],
  'es-ES_NarrowbandModel': ['Es_ES_spk24_8khz.wav', 'Es_ES_spk19_8khz.wav'],
  'pt-BR_BroadbandModel': ['pt-BR_Sample1-16KHz.wav', 'pt-BR_Sample2-16KHz.wav'],
  'pt-BR_NarrowbandModel': ['pt-BR_Sample1-8KHz.wav', 'pt-BR_Sample2-8KHz.wav'],
  'zh-CN_BroadbandModel': ['zh-CN_sample1_for_16k.wav', 'zh-CN_sample2_for_16k.wav'],
  'zh-CN_NarrowbandModel': ['zh-CN_sample1_for_8k.wav', 'zh-CN_sample2_for_8k.wav']
};

var playSample = (function() {

  var running = false;
  localStorage.setItem('currentlyDisplaying', 'false');
  localStorage.setItem('samplePlaying', 'false');

  return function(token, imageTag, sampleNumber, iconName, url) {

    $.publish('clearscreen');

    var currentlyDisplaying = localStorage.getItem('currentlyDisplaying');
    var samplePlaying = localStorage.getItem('samplePlaying');

    if (samplePlaying === sampleNumber) {
      console.log('HARD SOCKET STOP');
      $.publish('socketstop');
      localStorage.setItem('currentlyDisplaying', 'false');
      localStorage.setItem('samplePlaying', 'false');
      effects.stopToggleImage(timer, imageTag, iconName);
      effects.restoreImage(imageTag, iconName);
      running = false;
      return;
    }

    if (currentlyDisplaying === 'record') {
      showError('Currently audio is being recorded, please stop recording before playing a sample');
      return;
    } else if (currentlyDisplaying === 'fileupload' || samplePlaying !== 'false') {
      showError('Currently another file is playing, please stop the file or wait until it finishes');
      return;
    }

    localStorage.setItem('currentlyDisplaying', 'sample');
    localStorage.setItem('samplePlaying', sampleNumber);
    running = true;

    $('#resultsText').val('');   // clear hypotheses from previous runs

    var timer = setInterval(effects.toggleImage, 750, imageTag, iconName);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      var blob = xhr.response;
      var currentModel = localStorage.getItem('currentModel') || 'en-US_BroadbandModel';
      var reader = new FileReader();
      var blobToText = new Blob([blob]).slice(0, 4);
      reader.readAsText(blobToText);
      reader.onload = function() {
        var contentType = reader.result === 'fLaC' ? 'audio/flac' : 'audio/wav';
        console.log('Uploading file', reader.result);
        var mediaSourceURL = URL.createObjectURL(blob);
        var audio = new Audio();
        audio.src = mediaSourceURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
        $.subscribe('socketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
        handleFileUpload('sample', token, currentModel, blob, contentType, function(socket) {
          var parseOptions = {
            file: blob
          };
          var samplingRate = (currentModel.indexOf('Broadband') !== -1) ? 16000 : 8000;
          onFileProgress(parseOptions,
            // On data chunk
            function onData(chunk) {
              socket.send(chunk);
            },
            function isRunning() {
              if(running)
                return true;
              else
                return false;
            },
            // On file read error
            function(evt) {
              console.log('Error reading file: ', evt.message);
              // showError(evt.message);
            },
            // On load end
            function() {
              socket.send(JSON.stringify({'action': 'stop'}));
            },
            samplingRate
            );
        },
        // On connection end
          function() {
            effects.stopToggleImage(timer, imageTag, iconName);
            effects.restoreImage(imageTag, iconName);
            localStorage.getItem('currentlyDisplaying', 'false');
            localStorage.setItem('samplePlaying', 'false');
          }
        );
      };
    };
    xhr.send();
  };
})();


exports.initPlaySample = function(ctx) {

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][0];
    var el = $('.play-sample-1');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click( function() {
      playSample(ctx.token, imageTag, 'sample-1', iconName, fileName, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][1];
    var el = $('.play-sample-2');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click( function() {
      playSample(ctx.token, imageTag, 'sample-2', iconName, fileName, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);

};
},{"../handlefileupload":3,"../utils":8,"./effects":12,"./showerror":20}],17:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var Microphone = require('../Microphone');
var handleMicrophone = require('../handlemicrophone').handleMicrophone;
var showError = require('./showerror').showError;

exports.initRecordButton = function(ctx) {
  var running = false;
  var micOptions = {
    bufferSize: ctx.buffersize
  };
  var mic = new Microphone(micOptions);

  ctx.toggleRecordSpeechCommand = function() {
    var currentModel = localStorage.getItem('currentModel');

    if (!running) {
      $('#resultsText').val('');   // clear hypotheses from previous runs
      console.log('Not running, handleMicrophone()');
      handleMicrophone(ctx.token, currentModel, mic, function(err) {
        if (err) {
          var msg = 'Error: ' + err.message;
          console.log(msg);
          showError(msg);
          running = false;
        } else {
          console.log('starting mic');
          mic.record();
          running = true;
        }
      });
    } else {
      console.log('Stopping microphone, sending stop action message');
      $.publish('hardsocketstop');
      mic.stop();
      running = false;

      ctx.alchemyProxy.getAlchemyRelations(
        $('#resultsText').val(),
        function(err, response) {
          if (!err) {
            ctx.relations = response.relations;
          }
        }
      );
    }
  };
};

},{"../Microphone":1,"../handlemicrophone":4,"./showerror":20}],18:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

var initPlaySample = require('./playsample').initPlaySample;

exports.initSelectModel = function(ctx) {


  ctx.models.forEach(function(model) {
    if(model.name.indexOf('JP')>-1) {
        return;
    }
    $('#dropdownMenuList').append(
      $('<li>')
        .attr('role', 'presentation')
        .append(
          $('<a>').attr('role', 'menu-item')
            .attr('href', '/')
            .attr('data-model', model.name)
            .append(model.description.substring(0, model.description.length - 1), model.rate==8000?' (8KHz)':' (16KHz)'))
          )
  });


  $('#dropdownMenuList').click(function(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    console.log('Change view', $(evt.target).text());
    var newModelDescription = $(evt.target).text();
    var newModel = $(evt.target).data('model');
    $('#dropdownMenuDefault').empty().text(newModelDescription);
    $('#dropdownMenu1').dropdown('toggle');
    localStorage.setItem('currentModel', newModel);
    ctx.currentModel = newModel;
    initPlaySample(ctx);
    $.publish('clearscreen');
  });

};

},{"./playsample":16}],19:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';


exports.initSessionPermissions = function() {
  console.log('Initializing session permissions handler');
  // Radio buttons
  var sessionPermissionsRadio = $("#sessionPermissionsRadioGroup input[type='radio']");
  sessionPermissionsRadio.click(function() {
    var checkedValue = sessionPermissionsRadio.filter(':checked').val();
    console.log('checkedValue', checkedValue);
    localStorage.setItem('sessionPermissions', checkedValue);
  });
};

},{}],20:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';


exports.showError = function(msg) {
  console.log('Error: ', msg);
  var errorAlert = $('.error-row');
  errorAlert.hide();
  errorAlert.css('background-color', '#d74108');
  errorAlert.css('color', 'white');
  var errorMessage = $('#errorMessage');
  errorMessage.text(msg);
  errorAlert.show();
  $('#errorClose').click(function(e) {
    e.preventDefault();
    errorAlert.hide();
    return false;
  });
};

exports.showNotice = function(msg) {
  console.log('Notice: ', msg);
  var noticeAlert = $('.notification-row');
  noticeAlert.hide();
  noticeAlert.css('border', '2px solid #ececec');
  noticeAlert.css('background-color', '#f4f4f4');
  noticeAlert.css('color', 'black');
  var noticeMessage = $('#notificationMessage');
  noticeMessage.text(msg);
  noticeAlert.show();
  $('#notificationClose').click(function(e) {
    e.preventDefault();
    noticeAlert.hide();
    return false;
  });
};

exports.hideError = function() {
  var errorAlert = $('.error-row');
  errorAlert.hide();
};

},{}],21:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
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
/* global $ */
'use strict';

exports.initShowTab = function() {
  $('.nav-tabs a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
    //show selected tab / active
    var target = $(e.target).text();
    if (target === 'JSON') {
      $.publish('showjson');
    }
  });
};

},{}]},{},[5])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvTWljcm9waG9uZS5qcyIsInNyYy9kYXRhL21vZGVscy5qc29uIiwic3JjL2hhbmRsZWZpbGV1cGxvYWQuanMiLCJzcmMvaGFuZGxlbWljcm9waG9uZS5qcyIsInNyYy9pbmRleC5qcyIsInNyYy9tb2RlbHMuanMiLCJzcmMvc29ja2V0LmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3ZpZXdzL2FuaW1hdGVwYW5lbC5qcyIsInNyYy92aWV3cy9kaXNwbGF5bWV0YWRhdGEuanMiLCJzcmMvdmlld3MvZHJhZ2Ryb3AuanMiLCJzcmMvdmlld3MvZWZmZWN0cy5qcyIsInNyYy92aWV3cy9maWxldXBsb2FkLmpzIiwic3JjL3ZpZXdzL2dhbWUuanMiLCJzcmMvdmlld3MvaW5kZXguanMiLCJzcmMvdmlld3MvcGxheXNhbXBsZS5qcyIsInNyYy92aWV3cy9yZWNvcmRidXR0b24uanMiLCJzcmMvdmlld3Mvc2VsZWN0bW9kZWwuanMiLCJzcmMvdmlld3Mvc2Vzc2lvbnBlcm1pc3Npb25zLmpzIiwic3JjL3ZpZXdzL3Nob3dlcnJvci5qcyIsInNyYy92aWV3cy9zaG93dGFiLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25NQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgJ0xpY2Vuc2UnKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gJ0FTIElTJyBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCBPZmZsaW5lQXVkaW9Db250ZXh0ICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbi8qKlxuICogQ2FwdHVyZXMgbWljcm9waG9uZSBpbnB1dCBmcm9tIHRoZSBicm93c2VyLlxuICogV29ya3MgYXQgbGVhc3Qgb24gbGF0ZXN0IHZlcnNpb25zIG9mIEZpcmVmb3ggYW5kIENocm9tZVxuICovXG5mdW5jdGlvbiBNaWNyb3Bob25lKF9vcHRpb25zKSB7XG4gIHZhciBvcHRpb25zID0gX29wdGlvbnMgfHwge307XG5cbiAgLy8gd2UgcmVjb3JkIGluIG1vbm8gYmVjYXVzZSB0aGUgc3BlZWNoIHJlY29nbml0aW9uIHNlcnZpY2VcbiAgLy8gZG9lcyBub3Qgc3VwcG9ydCBzdGVyZW8uXG4gIHRoaXMuYnVmZmVyU2l6ZSA9IG9wdGlvbnMuYnVmZmVyU2l6ZSB8fCA4MTkyO1xuICB0aGlzLmlucHV0Q2hhbm5lbHMgPSBvcHRpb25zLmlucHV0Q2hhbm5lbHMgfHwgMTtcbiAgdGhpcy5vdXRwdXRDaGFubmVscyA9IG9wdGlvbnMub3V0cHV0Q2hhbm5lbHMgfHwgMTtcbiAgdGhpcy5yZWNvcmRpbmcgPSBmYWxzZTtcbiAgdGhpcy5yZXF1ZXN0ZWRBY2Nlc3MgPSBmYWxzZTtcbiAgdGhpcy5zYW1wbGVSYXRlID0gMTYwMDA7XG4gIC8vIGF1eGlsaWFyIGJ1ZmZlciB0byBrZWVwIHVudXNlZCBzYW1wbGVzICh1c2VkIHdoZW4gZG9pbmcgZG93bnNhbXBsaW5nKVxuICB0aGlzLmJ1ZmZlclVudXNlZFNhbXBsZXMgPSBuZXcgRmxvYXQzMkFycmF5KDApO1xuXG4gIC8vIENocm9tZSBvciBGaXJlZm94IG9yIElFIFVzZXIgbWVkaWFcbiAgaWYgKCFuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKSB7XG4gICAgbmF2aWdhdG9yLmdldFVzZXJNZWRpYSA9IG5hdmlnYXRvci53ZWJraXRHZXRVc2VyTWVkaWEgfHxcbiAgICBuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhIHx8IG5hdmlnYXRvci5tc0dldFVzZXJNZWRpYTtcbiAgfVxuXG59XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIHVzZXIgcmVqZWN0IHRoZSB1c2Ugb2YgdGhlIG1pY2hyb3Bob25lXG4gKiBAcGFyYW0gIGVycm9yIFRoZSBlcnJvclxuICovXG5NaWNyb3Bob25lLnByb3RvdHlwZS5vblBlcm1pc3Npb25SZWplY3RlZCA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnTWljcm9waG9uZS5vblBlcm1pc3Npb25SZWplY3RlZCgpJyk7XG4gIHRoaXMucmVxdWVzdGVkQWNjZXNzID0gZmFsc2U7XG4gIHRoaXMub25FcnJvcignUGVybWlzc2lvbiB0byBhY2Nlc3MgdGhlIG1pY3JvcGhvbmUgcmVqZXRlZC4nKTtcbn07XG5cbk1pY3JvcGhvbmUucHJvdG90eXBlLm9uRXJyb3IgPSBmdW5jdGlvbihlcnJvcikge1xuICBjb25zb2xlLmxvZygnTWljcm9waG9uZS5vbkVycm9yKCk6JywgZXJyb3IpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgd2hlbiB0aGUgdXNlciBhdXRob3JpemVzIHRoZSB1c2Ugb2YgdGhlIG1pY3JvcGhvbmUuXG4gKiBAcGFyYW0gIHtPYmplY3R9IHN0cmVhbSBUaGUgU3RyZWFtIHRvIGNvbm5lY3QgdG9cbiAqXG4gKi9cbk1pY3JvcGhvbmUucHJvdG90eXBlLm9uTWVkaWFTdHJlYW0gPSAgZnVuY3Rpb24oc3RyZWFtKSB7XG4gIHZhciBBdWRpb0N0eCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcblxuICBpZiAoIUF1ZGlvQ3R4KVxuICAgIHRocm93IG5ldyBFcnJvcignQXVkaW9Db250ZXh0IG5vdCBhdmFpbGFibGUnKTtcblxuICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KVxuICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IEF1ZGlvQ3R4KCk7XG5cbiAgdmFyIGdhaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gIHZhciBhdWRpb0lucHV0ID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlTWVkaWFTdHJlYW1Tb3VyY2Uoc3RyZWFtKTtcblxuICBhdWRpb0lucHV0LmNvbm5lY3QoZ2Fpbik7XG5cbiAgdGhpcy5taWMgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVTY3JpcHRQcm9jZXNzb3IodGhpcy5idWZmZXJTaXplLFxuICAgIHRoaXMuaW5wdXRDaGFubmVscywgdGhpcy5vdXRwdXRDaGFubmVscyk7XG5cbiAgLy8gdW5jb21tZW50IHRoZSBmb2xsb3dpbmcgbGluZSBpZiB5b3Ugd2FudCB0byB1c2UgeW91ciBtaWNyb3Bob25lIHNhbXBsZSByYXRlXG4gIC8vdGhpcy5zYW1wbGVSYXRlID0gdGhpcy5hdWRpb0NvbnRleHQuc2FtcGxlUmF0ZTtcbiAgY29uc29sZS5sb2coJ01pY3JvcGhvbmUub25NZWRpYVN0cmVhbSgpOiBzYW1wbGluZyByYXRlIGlzOicsIHRoaXMuc2FtcGxlUmF0ZSk7XG5cbiAgdGhpcy5taWMub25hdWRpb3Byb2Nlc3MgPSB0aGlzLl9vbmF1ZGlvcHJvY2Vzcy5iaW5kKHRoaXMpO1xuICB0aGlzLnN0cmVhbSA9IHN0cmVhbTtcblxuICBnYWluLmNvbm5lY3QodGhpcy5taWMpO1xuICB0aGlzLm1pYy5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcbiAgdGhpcy5yZWNvcmRpbmcgPSB0cnVlO1xuICB0aGlzLnJlcXVlc3RlZEFjY2VzcyA9IGZhbHNlO1xuICB0aGlzLm9uU3RhcnRSZWNvcmRpbmcoKTtcbn07XG5cbi8qKlxuICogY2FsbGJhY2sgdGhhdCBpcyBiZWluZyB1c2VkIGJ5IHRoZSBtaWNyb3Bob25lXG4gKiB0byBzZW5kIGF1ZGlvIGNodW5rcy5cbiAqIEBwYXJhbSAge29iamVjdH0gZGF0YSBhdWRpb1xuICovXG5NaWNyb3Bob25lLnByb3RvdHlwZS5fb25hdWRpb3Byb2Nlc3MgPSBmdW5jdGlvbihkYXRhKSB7XG4gIGlmICghdGhpcy5yZWNvcmRpbmcpIHtcbiAgICAvLyBXZSBzcGVhayBidXQgd2UgYXJlIG5vdCByZWNvcmRpbmdcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBTaW5nbGUgY2hhbm5lbFxuICB2YXIgY2hhbiA9IGRhdGEuaW5wdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG5cbiAgLy9yZXNhbXBsZXIodGhpcy5hdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSxkYXRhLmlucHV0QnVmZmVyLHRoaXMub25BdWRpbyk7XG5cbiAgdGhpcy5vbkF1ZGlvKHRoaXMuX2V4cG9ydERhdGFCdWZmZXJUbzE2S2h6KG5ldyBGbG9hdDMyQXJyYXkoY2hhbikpKTtcblxuICAvL2V4cG9ydCB3aXRoIG1pY3JvcGhvbmUgbWh6LCByZW1lbWJlciB0byB1cGRhdGUgdGhlIHRoaXMuc2FtcGxlUmF0ZVxuICAvLyB3aXRoIHRoZSBzYW1wbGUgcmF0ZSBmcm9tIHlvdXIgbWljcm9waG9uZVxuICAvLyB0aGlzLm9uQXVkaW8odGhpcy5fZXhwb3J0RGF0YUJ1ZmZlcihuZXcgRmxvYXQzMkFycmF5KGNoYW4pKSk7XG5cbn07XG5cbi8qKlxuICogU3RhcnQgdGhlIGF1ZGlvIHJlY29yZGluZ1xuICovXG5NaWNyb3Bob25lLnByb3RvdHlwZS5yZWNvcmQgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCFuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKXtcbiAgICB0aGlzLm9uRXJyb3IoJ0Jyb3dzZXIgZG9lc25cXCd0IHN1cHBvcnQgbWljcm9waG9uZSBpbnB1dCcpO1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5yZXF1ZXN0ZWRBY2Nlc3MpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLnJlcXVlc3RlZEFjY2VzcyA9IHRydWU7XG4gIG5hdmlnYXRvci5nZXRVc2VyTWVkaWEoeyBhdWRpbzogdHJ1ZSB9LFxuICAgIHRoaXMub25NZWRpYVN0cmVhbS5iaW5kKHRoaXMpLCAvLyBNaWNyb3Bob25lIHBlcm1pc3Npb24gZ3JhbnRlZFxuICAgIHRoaXMub25QZXJtaXNzaW9uUmVqZWN0ZWQuYmluZCh0aGlzKSk7IC8vIE1pY3JvcGhvbmUgcGVybWlzc2lvbiByZWplY3RlZFxufTtcblxuLyoqXG4gKiBTdG9wIHRoZSBhdWRpbyByZWNvcmRpbmdcbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMucmVjb3JkaW5nKVxuICAgIHJldHVybjtcbiAgdGhpcy5yZWNvcmRpbmcgPSBmYWxzZTtcbiAgdGhpcy5zdHJlYW0uZ2V0VHJhY2tzKClbMF0uc3RvcCgpO1xuICB0aGlzLnJlcXVlc3RlZEFjY2VzcyA9IGZhbHNlO1xuICB0aGlzLm1pYy5kaXNjb25uZWN0KDApO1xuICB0aGlzLm1pYyA9IG51bGw7XG4gIHRoaXMub25TdG9wUmVjb3JkaW5nKCk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBCbG9iIHR5cGU6ICdhdWRpby9sMTYnIHdpdGggdGhlIGNodW5rIGFuZCBkb3duc2FtcGxpbmcgdG8gMTYga0h6XG4gKiBjb21pbmcgZnJvbSB0aGUgbWljcm9waG9uZS5cbiAqIEV4cGxhbmF0aW9uIGZvciB0aGUgbWF0aDogVGhlIHJhdyB2YWx1ZXMgY2FwdHVyZWQgZnJvbSB0aGUgV2ViIEF1ZGlvIEFQSSBhcmVcbiAqIGluIDMyLWJpdCBGbG9hdGluZyBQb2ludCwgYmV0d2VlbiAtMSBhbmQgMSAocGVyIHRoZSBzcGVjaWZpY2F0aW9uKS5cbiAqIFRoZSB2YWx1ZXMgZm9yIDE2LWJpdCBQQ00gcmFuZ2UgYmV0d2VlbiAtMzI3NjggYW5kICszMjc2NyAoMTYtYml0IHNpZ25lZCBpbnRlZ2VyKS5cbiAqIE11bHRpcGx5IHRvIGNvbnRyb2wgdGhlIHZvbHVtZSBvZiB0aGUgb3V0cHV0LiBXZSBzdG9yZSBpbiBsaXR0bGUgZW5kaWFuLlxuICogQHBhcmFtICB7T2JqZWN0fSBidWZmZXIgTWljcm9waG9uZSBhdWRpbyBjaHVua1xuICogQHJldHVybiB7QmxvYn0gJ2F1ZGlvL2wxNicgY2h1bmtcbiAqIEBkZXByZWNhdGVkIFRoaXMgbWV0aG9kIGlzIGRlcHJhY2F0ZWRcbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUuX2V4cG9ydERhdGFCdWZmZXJUbzE2S2h6ID0gZnVuY3Rpb24oYnVmZmVyTmV3U2FtcGxlcykge1xuICB2YXIgYnVmZmVyID0gbnVsbCxcbiAgICBuZXdTYW1wbGVzID0gYnVmZmVyTmV3U2FtcGxlcy5sZW5ndGgsXG4gICAgdW51c2VkU2FtcGxlcyA9IHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlcy5sZW5ndGg7XG5cblxuICBpZiAodW51c2VkU2FtcGxlcyA+IDApIHtcbiAgICBidWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHVudXNlZFNhbXBsZXMgKyBuZXdTYW1wbGVzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHVudXNlZFNhbXBsZXM7ICsraSkge1xuICAgICAgYnVmZmVyW2ldID0gdGhpcy5idWZmZXJVbnVzZWRTYW1wbGVzW2ldO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgbmV3U2FtcGxlczsgKytpKSB7XG4gICAgICBidWZmZXJbdW51c2VkU2FtcGxlcyArIGldID0gYnVmZmVyTmV3U2FtcGxlc1tpXTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgYnVmZmVyID0gYnVmZmVyTmV3U2FtcGxlcztcbiAgfVxuXG4gIC8vIGRvd25zYW1wbGluZyB2YXJpYWJsZXNcbiAgdmFyIGZpbHRlciA9IFtcbiAgICAgIC0wLjAzNzkzNSwgLTAuMDAwODkwMjQsIDAuMDQwMTczLCAwLjAxOTk4OSwgMC4wMDQ3NzkyLCAtMC4wNTg2NzUsIC0wLjA1NjQ4NyxcbiAgICAgIC0wLjAwNDA2NTMsIDAuMTQ1MjcsIDAuMjY5MjcsIDAuMzM5MTMsIDAuMjY5MjcsIDAuMTQ1MjcsIC0wLjAwNDA2NTMsIC0wLjA1NjQ4NyxcbiAgICAgIC0wLjA1ODY3NSwgMC4wMDQ3NzkyLCAwLjAxOTk4OSwgMC4wNDAxNzMsIC0wLjAwMDg5MDI0LCAtMC4wMzc5MzVcbiAgICBdLFxuICAgIHNhbXBsaW5nUmF0ZVJhdGlvID0gdGhpcy5hdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSAvIDE2MDAwLFxuICAgIG5PdXRwdXRTYW1wbGVzID0gTWF0aC5mbG9vcigoYnVmZmVyLmxlbmd0aCAtIGZpbHRlci5sZW5ndGgpIC8gKHNhbXBsaW5nUmF0ZVJhdGlvKSkgKyAxLFxuICAgIHBjbUVuY29kZWRCdWZmZXIxNmsgPSBuZXcgQXJyYXlCdWZmZXIobk91dHB1dFNhbXBsZXMgKiAyKSxcbiAgICBkYXRhVmlldzE2ayA9IG5ldyBEYXRhVmlldyhwY21FbmNvZGVkQnVmZmVyMTZrKSxcbiAgICBpbmRleCA9IDAsXG4gICAgdm9sdW1lID0gMHg3RkZGLCAvL3JhbmdlIGZyb20gMCB0byAweDdGRkYgdG8gY29udHJvbCB0aGUgdm9sdW1lXG4gICAgbk91dCA9IDA7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgKyBmaWx0ZXIubGVuZ3RoIC0gMSA8IGJ1ZmZlci5sZW5ndGg7IGkgPSBNYXRoLnJvdW5kKHNhbXBsaW5nUmF0ZVJhdGlvICogbk91dCkpIHtcbiAgICB2YXIgc2FtcGxlID0gMDtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZpbHRlci5sZW5ndGg7ICsraikge1xuICAgICAgc2FtcGxlICs9IGJ1ZmZlcltpICsgal0gKiBmaWx0ZXJbal07XG4gICAgfVxuICAgIHNhbXBsZSAqPSB2b2x1bWU7XG4gICAgZGF0YVZpZXcxNmsuc2V0SW50MTYoaW5kZXgsIHNhbXBsZSwgdHJ1ZSk7IC8vICd0cnVlJyAtPiBtZWFucyBsaXR0bGUgZW5kaWFuXG4gICAgaW5kZXggKz0gMjtcbiAgICBuT3V0Kys7XG4gIH1cblxuICB2YXIgaW5kZXhTYW1wbGVBZnRlckxhc3RVc2VkID0gTWF0aC5yb3VuZChzYW1wbGluZ1JhdGVSYXRpbyAqIG5PdXQpO1xuICB2YXIgcmVtYWluaW5nID0gYnVmZmVyLmxlbmd0aCAtIGluZGV4U2FtcGxlQWZ0ZXJMYXN0VXNlZDtcbiAgaWYgKHJlbWFpbmluZyA+IDApIHtcbiAgICB0aGlzLmJ1ZmZlclVudXNlZFNhbXBsZXMgPSBuZXcgRmxvYXQzMkFycmF5KHJlbWFpbmluZyk7XG4gICAgZm9yIChpID0gMDsgaSA8IHJlbWFpbmluZzsgKytpKSB7XG4gICAgICB0aGlzLmJ1ZmZlclVudXNlZFNhbXBsZXNbaV0gPSBidWZmZXJbaW5kZXhTYW1wbGVBZnRlckxhc3RVc2VkICsgaV07XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlcyA9IG5ldyBGbG9hdDMyQXJyYXkoMCk7XG4gIH1cblxuICByZXR1cm4gbmV3IEJsb2IoW2RhdGFWaWV3MTZrXSwge1xuICAgIHR5cGU6ICdhdWRpby9sMTYnXG4gIH0pO1xuICB9O1xuXG5cblxuLy8gbmF0aXZlIHdheSBvZiByZXNhbXBsaW5nIGNhcHR1cmVkIGF1ZGlvXG52YXIgcmVzYW1wbGVyID0gZnVuY3Rpb24oc2FtcGxlUmF0ZSwgYXVkaW9CdWZmZXIsIGNhbGxiYWNrUHJvY2Vzc0F1ZGlvKSB7XG5cbiAgY29uc29sZS5sb2coJ2xlbmd0aDogJyArIGF1ZGlvQnVmZmVyLmxlbmd0aCArICcgJyArIHNhbXBsZVJhdGUpO1xuICB2YXIgY2hhbm5lbHMgPSAxO1xuICB2YXIgdGFyZ2V0U2FtcGxlUmF0ZSA9IDE2MDAwO1xuICB2YXIgbnVtU2FtcGxlc1RhcmdldCA9IGF1ZGlvQnVmZmVyLmxlbmd0aCAqIHRhcmdldFNhbXBsZVJhdGUgLyBzYW1wbGVSYXRlO1xuXG4gIHZhciBvZmZsaW5lQ29udGV4dCA9IG5ldyBPZmZsaW5lQXVkaW9Db250ZXh0KGNoYW5uZWxzLCBudW1TYW1wbGVzVGFyZ2V0LCB0YXJnZXRTYW1wbGVSYXRlKTtcbiAgdmFyIGJ1ZmZlclNvdXJjZSA9IG9mZmxpbmVDb250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xuICBidWZmZXJTb3VyY2UuYnVmZmVyID0gYXVkaW9CdWZmZXI7XG5cbiAgLy8gY2FsbGJhY2sgdGhhdCBpcyBjYWxsZWQgd2hlbiB0aGUgcmVzYW1wbGluZyBmaW5pc2hlc1xuICBvZmZsaW5lQ29udGV4dC5vbmNvbXBsZXRlID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICB2YXIgc2FtcGxlc1RhcmdldCA9IGV2ZW50LnJlbmRlcmVkQnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICAgIGNvbnNvbGUubG9nKCdEb25lIHJlc2FtcGxpbmc6ICcgKyBzYW1wbGVzVGFyZ2V0Lmxlbmd0aCArICcgc2FtcGxlcyBwcm9kdWNlZCcpO1xuXG4gIC8vIGNvbnZlcnQgZnJvbSBbLTEsMV0gcmFuZ2Ugb2YgZmxvYXRpbmcgcG9pbnQgbnVtYmVycyB0byBbLTMyNzY3LDMyNzY3XSByYW5nZSBvZiBpbnRlZ2Vyc1xuICB2YXIgaW5kZXggPSAwO1xuICB2YXIgdm9sdW1lID0gMHg3RkZGO1xuICAgIHZhciBwY21FbmNvZGVkQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHNhbXBsZXNUYXJnZXQubGVuZ3RoKjIpOyAgICAvLyBzaG9ydCBpbnRlZ2VyIHRvIGJ5dGVcbiAgICB2YXIgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcocGNtRW5jb2RlZEJ1ZmZlcik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzYW1wbGVzVGFyZ2V0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBkYXRhVmlldy5zZXRJbnQxNihpbmRleCwgc2FtcGxlc1RhcmdldFtpXSp2b2x1bWUsIHRydWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICAvLyBsMTYgaXMgdGhlIE1JTUUgdHlwZSBmb3IgMTYtYml0IFBDTVxuICAgIGNhbGxiYWNrUHJvY2Vzc0F1ZGlvKG5ldyBCbG9iKFtkYXRhVmlld10sIHsgdHlwZTogJ2F1ZGlvL2wxNicgfSkpO1xuICB9O1xuXG4gIGJ1ZmZlclNvdXJjZS5jb25uZWN0KG9mZmxpbmVDb250ZXh0LmRlc3RpbmF0aW9uKTtcbiAgYnVmZmVyU291cmNlLnN0YXJ0KDApO1xuICBvZmZsaW5lQ29udGV4dC5zdGFydFJlbmRlcmluZygpO1xufTtcblxuXG5cbi8qKlxuICogQ3JlYXRlcyBhIEJsb2IgdHlwZTogJ2F1ZGlvL2wxNicgd2l0aCB0aGVcbiAqIGNodW5rIGNvbWluZyBmcm9tIHRoZSBtaWNyb3Bob25lLlxuICovXG52YXIgZXhwb3J0RGF0YUJ1ZmZlciA9IGZ1bmN0aW9uKGJ1ZmZlciwgYnVmZmVyU2l6ZSkge1xuICB2YXIgcGNtRW5jb2RlZEJ1ZmZlciA9IG51bGwsXG4gICAgZGF0YVZpZXcgPSBudWxsLFxuICAgIGluZGV4ID0gMCxcbiAgICB2b2x1bWUgPSAweDdGRkY7IC8vcmFuZ2UgZnJvbSAwIHRvIDB4N0ZGRiB0byBjb250cm9sIHRoZSB2b2x1bWVcblxuICBwY21FbmNvZGVkQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUgKiAyKTtcbiAgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcocGNtRW5jb2RlZEJ1ZmZlcik7XG5cbiAgLyogRXhwbGFuYXRpb24gZm9yIHRoZSBtYXRoOiBUaGUgcmF3IHZhbHVlcyBjYXB0dXJlZCBmcm9tIHRoZSBXZWIgQXVkaW8gQVBJIGFyZVxuICAgKiBpbiAzMi1iaXQgRmxvYXRpbmcgUG9pbnQsIGJldHdlZW4gLTEgYW5kIDEgKHBlciB0aGUgc3BlY2lmaWNhdGlvbikuXG4gICAqIFRoZSB2YWx1ZXMgZm9yIDE2LWJpdCBQQ00gcmFuZ2UgYmV0d2VlbiAtMzI3NjggYW5kICszMjc2NyAoMTYtYml0IHNpZ25lZCBpbnRlZ2VyKS5cbiAgICogTXVsdGlwbHkgdG8gY29udHJvbCB0aGUgdm9sdW1lIG9mIHRoZSBvdXRwdXQuIFdlIHN0b3JlIGluIGxpdHRsZSBlbmRpYW4uXG4gICAqL1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuICAgIGRhdGFWaWV3LnNldEludDE2KGluZGV4LCBidWZmZXJbaV0gKiB2b2x1bWUsIHRydWUpO1xuICAgIGluZGV4ICs9IDI7XG4gIH1cblxuICAvLyBsMTYgaXMgdGhlIE1JTUUgdHlwZSBmb3IgMTYtYml0IFBDTVxuICByZXR1cm4gbmV3IEJsb2IoW2RhdGFWaWV3XSwgeyB0eXBlOiAnYXVkaW8vbDE2JyB9KTtcbn07XG5cbk1pY3JvcGhvbmUucHJvdG90eXBlLl9leHBvcnREYXRhQnVmZmVyID0gZnVuY3Rpb24oYnVmZmVyKXtcbiAgdXRpbHMuZXhwb3J0RGF0YUJ1ZmZlcihidWZmZXIsIHRoaXMuYnVmZmVyU2l6ZSk7XG59O1xuXG5cbi8vIEZ1bmN0aW9ucyB1c2VkIHRvIGNvbnRyb2wgTWljcm9waG9uZSBldmVudHMgbGlzdGVuZXJzLlxuTWljcm9waG9uZS5wcm90b3R5cGUub25TdGFydFJlY29yZGluZyA9ICBmdW5jdGlvbigpIHt9O1xuTWljcm9waG9uZS5wcm90b3R5cGUub25TdG9wUmVjb3JkaW5nID0gIGZ1bmN0aW9uKCkge307XG5NaWNyb3Bob25lLnByb3RvdHlwZS5vbkF1ZGlvID0gIGZ1bmN0aW9uKCkge307XG5cbm1vZHVsZS5leHBvcnRzID0gTWljcm9waG9uZTsiLCJtb2R1bGUuZXhwb3J0cz17XG4gICBcIm1vZGVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vc3RyZWFtLndhdHNvbnBsYXRmb3JtLm5ldC9zcGVlY2gtdG8tdGV4dC9hcGkvdjEvbW9kZWxzL2VuLVVTX0Jyb2FkYmFuZE1vZGVsXCIsXG4gICAgICAgICBcInJhdGVcIjogMTYwMDAsXG4gICAgICAgICBcIm5hbWVcIjogXCJlbi1VU19Ccm9hZGJhbmRNb2RlbFwiLFxuICAgICAgICAgXCJsYW5ndWFnZVwiOiBcImVuLVVTXCIsXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVVMgRW5nbGlzaCBicm9hZGJhbmQgbW9kZWwgKDE2S0h6KVwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lbi1VU19OYXJyb3diYW5kTW9kZWxcIixcbiAgICAgICAgIFwicmF0ZVwiOiA4MDAwLFxuICAgICAgICAgXCJuYW1lXCI6IFwiZW4tVVNfTmFycm93YmFuZE1vZGVsXCIsXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiZW4tVVNcIixcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJVUyBFbmdsaXNoIG5hcnJvd2JhbmQgbW9kZWwgKDhLSHopXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vc3RyZWFtLndhdHNvbnBsYXRmb3JtLm5ldC9zcGVlY2gtdG8tdGV4dC9hcGkvdjEvbW9kZWxzL2VzLUVTX0Jyb2FkYmFuZE1vZGVsXCIsXG4gICAgICAgICBcInJhdGVcIjogMTYwMDAsXG4gICAgICAgICBcIm5hbWVcIjogXCJlcy1FU19Ccm9hZGJhbmRNb2RlbFwiLFxuICAgICAgICAgXCJsYW5ndWFnZVwiOiBcImVzLUVTXCIsXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiU3BhbmlzaCBicm9hZGJhbmQgbW9kZWwgKDE2S0h6KVwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lcy1FU19OYXJyb3diYW5kTW9kZWxcIixcbiAgICAgICAgIFwicmF0ZVwiOiA4MDAwLFxuICAgICAgICAgXCJuYW1lXCI6IFwiZXMtRVNfTmFycm93YmFuZE1vZGVsXCIsXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiZXMtRVNcIixcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJTcGFuaXNoIG5hcnJvd2JhbmQgbW9kZWwgKDhLSHopXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vc3RyZWFtLndhdHNvbnBsYXRmb3JtLm5ldC9zcGVlY2gtdG8tdGV4dC9hcGkvdjEvbW9kZWxzL3B0LUJSX0Jyb2FkYmFuZE1vZGVsXCIsXG4gICAgICAgICBcInJhdGVcIjogMTYwMDAsXG4gICAgICAgICBcIm5hbWVcIjogXCJwdC1CUl9Ccm9hZGJhbmRNb2RlbFwiLFxuICAgICAgICAgXCJsYW5ndWFnZVwiOiBcInB0LUJSXCIsXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQnJhemlsaWFuIFBvcnR1Z3Vlc2UgYnJvYWRiYW5kIG1vZGVsICgxNktIeilcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9zdHJlYW0ud2F0c29ucGxhdGZvcm0ubmV0L3NwZWVjaC10by10ZXh0L2FwaS92MS9tb2RlbHMvcHQtQlJfTmFycm93YmFuZE1vZGVsXCIsXG4gICAgICAgICBcInJhdGVcIjogODAwMCxcbiAgICAgICAgIFwibmFtZVwiOiBcInB0LUJSX05hcnJvd2JhbmRNb2RlbFwiLFxuICAgICAgICAgXCJsYW5ndWFnZVwiOiBcInB0LUJSXCIsXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQnJhemlsaWFuIFBvcnR1Z3Vlc2UgbmFycm93YmFuZCBtb2RlbCAoOEtIeilcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9zdHJlYW0ud2F0c29ucGxhdGZvcm0ubmV0L3NwZWVjaC10by10ZXh0L2FwaS92MS9tb2RlbHMvemgtQ05fQnJvYWRiYW5kTW9kZWxcIixcbiAgICAgICAgIFwicmF0ZVwiOiAxNjAwMCxcbiAgICAgICAgIFwibmFtZVwiOiBcInpoLUNOX0Jyb2FkYmFuZE1vZGVsXCIsXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiemgtQ05cIixcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJNYW5kYXJpbiBicm9hZGJhbmQgbW9kZWwgKDE2S0h6KVwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy96aC1DTl9OYXJyb3diYW5kTW9kZWxcIixcbiAgICAgICAgIFwicmF0ZVwiOiA4MDAwLFxuICAgICAgICAgXCJuYW1lXCI6IFwiemgtQ05fTmFycm93YmFuZE1vZGVsXCIsXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiemgtQ05cIixcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJNYW5kYXJpbiBuYXJyb3diYW5kIG1vZGVsICg4S0h6KVwiXG4gICAgICB9XG4gICBdXG59XG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE1IElCTSBDb3JwLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCAkICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkaXNwbGF5ID0gcmVxdWlyZSgnLi92aWV3cy9kaXNwbGF5bWV0YWRhdGEnKTtcbnZhciBpbml0U29ja2V0ID0gcmVxdWlyZSgnLi9zb2NrZXQnKS5pbml0U29ja2V0O1xuXG5leHBvcnRzLmhhbmRsZUZpbGVVcGxvYWQgPSBmdW5jdGlvbih0eXBlLCB0b2tlbiwgbW9kZWwsIGZpbGUsIGNvbnRlbnRUeXBlLCBjYWxsYmFjaywgb25lbmQpIHtcblxuICAgIC8vIFNldCBjdXJyZW50bHlEaXNwbGF5aW5nIHRvIHByZXZlbnQgb3RoZXIgc29ja2V0cyBmcm9tIG9wZW5pbmdcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsIHR5cGUpO1xuXG4gICAgLy8gJCgnI3Byb2dyZXNzSW5kaWNhdG9yJykuY3NzKCd2aXNpYmlsaXR5JywgJ3Zpc2libGUnKTtcblxuICAgICQuc3Vic2NyaWJlKCdwcm9ncmVzcycsIGZ1bmN0aW9uKGV2dCwgZGF0YSkge1xuICAgICAgY29uc29sZS5sb2coJ3Byb2dyZXNzOiAnLCBkYXRhKTtcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCdjb250ZW50VHlwZScsIGNvbnRlbnRUeXBlKTtcblxuICAgIHZhciBiYXNlU3RyaW5nID0gJyc7XG4gICAgdmFyIGJhc2VKU09OID0gJyc7XG5cbiAgICAkLnN1YnNjcmliZSgnc2hvd2pzb24nLCBmdW5jdGlvbigpIHtcbiAgICAgIHZhciAkcmVzdWx0c0pTT04gPSAkKCcjcmVzdWx0c0pTT04nKTtcbiAgICAgICRyZXN1bHRzSlNPTi5lbXB0eSgpO1xuICAgICAgJHJlc3VsdHNKU09OLmFwcGVuZChiYXNlSlNPTik7XG4gICAgfSk7XG5cbiAgICB2YXIgb3B0aW9ucyA9IHt9O1xuICAgIG9wdGlvbnMudG9rZW4gPSB0b2tlbjtcbiAgICBvcHRpb25zLm1lc3NhZ2UgPSB7XG4gICAgICAnYWN0aW9uJzogJ3N0YXJ0JyxcbiAgICAgICdjb250ZW50LXR5cGUnOiBjb250ZW50VHlwZSxcbiAgICAgICdpbnRlcmltX3Jlc3VsdHMnOiB0cnVlLFxuICAgICAgJ2NvbnRpbnVvdXMnOiB0cnVlLFxuICAgICAgJ3dvcmRfY29uZmlkZW5jZSc6IHRydWUsXG4gICAgICAndGltZXN0YW1wcyc6IHRydWUsXG4gICAgICAnbWF4X2FsdGVybmF0aXZlcyc6IDMsXG4gICAgICAnaW5hY3Rpdml0eV90aW1lb3V0JzogNjAwXG4gICAgfTtcbiAgICBvcHRpb25zLm1vZGVsID0gbW9kZWw7XG5cbiAgICBmdW5jdGlvbiBvbk9wZW4oKSB7XG4gICAgICBjb25zb2xlLmxvZygnU29ja2V0IG9wZW5lZCcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uTGlzdGVuaW5nKHNvY2tldCkge1xuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBsaXN0ZW5pbmcnKTtcbiAgICAgIGNhbGxiYWNrKHNvY2tldCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25NZXNzYWdlKG1zZykge1xuICAgICAgaWYgKG1zZy5yZXN1bHRzKSB7XG4gICAgICAgIC8vIENvbnZlcnQgdG8gY2xvc3VyZSBhcHByb2FjaFxuICAgICAgICBiYXNlU3RyaW5nID0gZGlzcGxheS5zaG93UmVzdWx0KG1zZywgYmFzZVN0cmluZywgbW9kZWwpO1xuICAgICAgICBiYXNlSlNPTiA9IGRpc3BsYXkuc2hvd0pTT04obXNnLCBiYXNlSlNPTik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25FcnJvcihldnQpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgJ2ZhbHNlJyk7XG4gICAgICBvbmVuZChldnQpO1xuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBlcnI6ICcsIGV2dC5jb2RlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNsb3NlKGV2dCkge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCAnZmFsc2UnKTtcbiAgICAgIG9uZW5kKGV2dCk7XG4gICAgICBjb25zb2xlLmxvZygnU29ja2V0IGNsb3Npbmc6ICcsIGV2dCk7XG4gICAgfVxuXG4gICAgaW5pdFNvY2tldChvcHRpb25zLCBvbk9wZW4sIG9uTGlzdGVuaW5nLCBvbk1lc3NhZ2UsIG9uRXJyb3IsIG9uQ2xvc2UpO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLyogZ2xvYmFsICQgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGluaXRTb2NrZXQgPSByZXF1aXJlKCcuL3NvY2tldCcpLmluaXRTb2NrZXQ7XG52YXIgZGlzcGxheSA9IHJlcXVpcmUoJy4vdmlld3MvZGlzcGxheW1ldGFkYXRhJyk7XG5cbmV4cG9ydHMuaGFuZGxlTWljcm9waG9uZSA9IGZ1bmN0aW9uKHRva2VuLCBtb2RlbCwgbWljLCBjYWxsYmFjaykge1xuICBpZiAobW9kZWwuaW5kZXhPZignTmFycm93YmFuZCcpID4gLTEpIHtcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdNaWNyb3Bob25lIHRyYW5zY3JpcHRpb24gY2Fubm90IGFjY29tb2RhdGUgbmFycm93YmFuZCBtb2RlbHMsICcrXG4gICAgICAncGxlYXNlIHNlbGVjdCBhbm90aGVyJyk7XG4gICAgY2FsbGJhY2soZXJyLCBudWxsKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAkLnB1Ymxpc2goJ2NsZWFyc2NyZWVuJyk7XG5cbiAgLy8gVGVzdCBvdXQgd2Vic29ja2V0XG4gIHZhciBiYXNlU3RyaW5nID0gJyc7XG4gIHZhciBiYXNlSlNPTiA9ICcnO1xuXG4gICQuc3Vic2NyaWJlKCdzaG93anNvbicsIGZ1bmN0aW9uKCkge1xuICAgIHZhciAkcmVzdWx0c0pTT04gPSAkKCcjcmVzdWx0c0pTT04nKTtcbiAgICAkcmVzdWx0c0pTT04uZW1wdHkoKTtcbiAgICAkcmVzdWx0c0pTT04uYXBwZW5kKGJhc2VKU09OKTtcbiAgfSk7XG5cbiAgdmFyIG9wdGlvbnMgPSB7fTtcbiAgb3B0aW9ucy50b2tlbiA9IHRva2VuO1xuICBvcHRpb25zLm1lc3NhZ2UgPSB7XG4gICAgJ2FjdGlvbic6ICdzdGFydCcsXG4gICAgJ2NvbnRlbnQtdHlwZSc6ICdhdWRpby9sMTY7cmF0ZT0xNjAwMCcsXG4gICAgJ2ludGVyaW1fcmVzdWx0cyc6IHRydWUsXG4gICAgJ2NvbnRpbnVvdXMnOiB0cnVlLFxuICAgICd3b3JkX2NvbmZpZGVuY2UnOiB0cnVlLFxuICAgICd0aW1lc3RhbXBzJzogdHJ1ZSxcbiAgICAnbWF4X2FsdGVybmF0aXZlcyc6IDMsXG4gICAgJ2luYWN0aXZpdHlfdGltZW91dCc6IDYwMFxuICB9O1xuICBvcHRpb25zLm1vZGVsID0gbW9kZWw7XG5cbiAgZnVuY3Rpb24gb25PcGVuKHNvY2tldCkge1xuICAgIGNvbnNvbGUubG9nKCdNaWMgc29ja2V0OiBvcGVuZWQnKTtcbiAgICBjYWxsYmFjayhudWxsLCBzb2NrZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gb25MaXN0ZW5pbmcoc29ja2V0KSB7XG5cbiAgICBtaWMub25BdWRpbyA9IGZ1bmN0aW9uKGJsb2IpIHtcbiAgICAgIGlmIChzb2NrZXQucmVhZHlTdGF0ZSA8IDIpIHtcbiAgICAgICAgc29ja2V0LnNlbmQoYmxvYik7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uTWVzc2FnZShtc2cpIHtcbiAgICBpZiAobXNnLnJlc3VsdHMpIHtcbiAgICAgIGJhc2VTdHJpbmcgPSBkaXNwbGF5LnNob3dSZXN1bHQobXNnLCBiYXNlU3RyaW5nLCBtb2RlbCk7XG4gICAgICBiYXNlSlNPTiA9IGRpc3BsYXkuc2hvd0pTT04obXNnLCBiYXNlSlNPTik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgICBjb25zb2xlLmxvZygnTWljIHNvY2tldCBlcnI6ICcsIGVycik7XG4gIH1cblxuICBmdW5jdGlvbiBvbkNsb3NlKGV2dCkge1xuICAgIGNvbnNvbGUubG9nKCdNaWMgc29ja2V0IGNsb3NlOiAnLCBldnQpO1xuICB9XG5cbiAgaW5pdFNvY2tldChvcHRpb25zLCBvbk9wZW4sIG9uTGlzdGVuaW5nLCBvbk1lc3NhZ2UsIG9uRXJyb3IsIG9uQ2xvc2UpO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLypnbG9iYWwgJDpmYWxzZSwgQlVGRkVSU0laRSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBtb2RlbHMgPSByZXF1aXJlKCcuL2RhdGEvbW9kZWxzLmpzb24nKS5tb2RlbHM7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG51dGlscy5pbml0UHViU3ViKCk7XG52YXIgaW5pdFZpZXdzID0gcmVxdWlyZSgnLi92aWV3cycpLmluaXRWaWV3cztcbnZhciBzaG93ZXJyb3IgPSByZXF1aXJlKCcuL3ZpZXdzL3Nob3dlcnJvcicpO1xudmFyIHNob3dFcnJvciA9IHNob3dlcnJvci5zaG93RXJyb3I7XG52YXIgZ2V0TW9kZWxzID0gcmVxdWlyZSgnLi9tb2RlbHMnKS5nZXRNb2RlbHM7XG5cbndpbmRvdy5CVUZGRVJTSVpFID0gODE5MjtcblxuJChkb2N1bWVudCkucmVhZHkoZnVuY3Rpb24oKSB7XG4gIHZhciB0b2tlbkdlbmVyYXRvciA9IHV0aWxzLmNyZWF0ZVRva2VuR2VuZXJhdG9yKCk7XG4gIHZhciBhbGNoZW15UHJveHkgPSB1dGlscy5jcmVhdGVBbGNoZW15UHJveHkoKTtcblxuICBhbGNoZW15UHJveHkuZ2V0QWxjaGVteVJlbGF0aW9ucyhcbiAgICBcIk1vdmUgdGhlIGZhaXJ5IHRvIHRoZSBsZWZ0IHNpZGUgb2YgdGhlIHNjcmVlbi5cIixcbiAgICBmdW5jdGlvbihlcnIsIGpzb24pIHtcbiAgICAgIGNvbnNvbGUubG9nKGpzb24pO1xuICAgIH1cbiAgKVxuXG4gIC8vIE1ha2UgY2FsbCB0byBBUEkgdG8gdHJ5IGFuZCBnZXQgdG9rZW5zXG4gIHRva2VuR2VuZXJhdG9yLmdldFNwZWVjaFRvVGV4dFRva2VuKGZ1bmN0aW9uKGVyciwgdG9rZW4pIHtcbiAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5jbGVhcigpO1xuICAgIH07XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdObyBzcGVlY2gtdG8tdGV4dCBhdXRob3JpemF0aW9uIHRva2VuIGF2YWlsYWJsZScpO1xuICAgICAgY29uc29sZS5lcnJvcignQXR0ZW1wdGluZyB0byByZWNvbm5lY3QuLi4nKTtcblxuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSlcbiAgICAgICAgc2hvd0Vycm9yKCdTZXJ2ZXIgZXJyb3IgJyArIGVyci5jb2RlICsgJzogJysgZXJyLmVycm9yKTtcbiAgICAgIGVsc2VcbiAgICAgICAgc2hvd0Vycm9yKCdTZXJ2ZXIgZXJyb3IgJyArIGVyci5jb2RlICsgJzogcGxlYXNlIHJlZnJlc2ggeW91ciBicm93c2VyIGFuZCB0cnkgYWdhaW4nKTtcbiAgICB9XG5cbiAgICB2YXIgdmlld0NvbnRleHQgPSB7XG4gICAgICBjdXJyZW50TW9kZWw6ICdlbi1VU19Ccm9hZGJhbmRNb2RlbCcsXG4gICAgICBtb2RlbHM6IG1vZGVscyxcbiAgICAgIHRva2VuOiB0b2tlbixcbiAgICAgIGFsY2hlbXlQcm94eTogYWxjaGVteVByb3h5LFxuICAgICAgYnVmZmVyU2l6ZTogQlVGRkVSU0laRVxuICAgIH07XG5cbiAgICBpbml0Vmlld3Modmlld0NvbnRleHQpO1xuXG4gICAgLy8gU2F2ZSBtb2RlbHMgdG8gbG9jYWxzdG9yYWdlXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ21vZGVscycsIEpTT04uc3RyaW5naWZ5KG1vZGVscykpO1xuXG4gICAgLy8gU2V0IGRlZmF1bHQgY3VycmVudCBtb2RlbFxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50TW9kZWwnLCAnZW4tVVNfQnJvYWRiYW5kTW9kZWwnKTtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc2Vzc2lvblBlcm1pc3Npb25zJywgJ3RydWUnKTtcblxuICAgIGdldE1vZGVscyh0b2tlbik7XG5cbiAgICAkLnN1YnNjcmliZSgnY2xlYXJzY3JlZW4nLCBmdW5jdGlvbigpIHtcbiAgICAgICQoJyNyZXN1bHRzVGV4dCcpLnRleHQoJycpO1xuICAgICAgJCgnI3Jlc3VsdHNKU09OJykudGV4dCgnJyk7XG4gICAgICAkKCcuZXJyb3Itcm93JykuaGlkZSgpO1xuICAgICAgJCgnLm5vdGlmaWNhdGlvbi1yb3cnKS5oaWRlKCk7XG4gICAgICAkKCcuaHlwb3RoZXNlcyA+IHVsJykuZW1wdHkoKTtcbiAgICAgICQoJyNtZXRhZGF0YVRhYmxlQm9keScpLmVtcHR5KCk7XG4gICAgfSk7XG5cbiAgfSk7XG5cbn0pO1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4ndXNlIHN0cmljdCc7XG52YXIgc2VsZWN0TW9kZWwgPSByZXF1aXJlKCcuL3ZpZXdzL3NlbGVjdG1vZGVsJykuaW5pdFNlbGVjdE1vZGVsO1xuXG5leHBvcnRzLmdldE1vZGVscyA9IGZ1bmN0aW9uKHRva2VuKSB7XG4gIHZhciB2aWV3Q29udGV4dCA9IHtcbiAgICBjdXJyZW50TW9kZWw6ICdlbi1VU19Ccm9hZGJhbmRNb2RlbCcsXG4gICAgbW9kZWxzOiBudWxsLFxuICAgIHRva2VuOiB0b2tlbixcbiAgICBidWZmZXJTaXplOiBCVUZGRVJTSVpFXG4gIH07XG4gIHZhciBtb2RlbFVybCA9ICdodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscyc7XG4gIHZhciBzdHRSZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gIHN0dFJlcXVlc3Qub3BlbignR0VUJywgbW9kZWxVcmwsIHRydWUpO1xuICBzdHRSZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IHRydWU7XG4gIHN0dFJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgc3R0UmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdYLVdhdHNvbi1BdXRob3JpemF0aW9uLVRva2VuJywgdG9rZW4pO1xuICBzdHRSZXF1ZXN0Lm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciByZXNwb25zZSA9IEpTT04ucGFyc2Uoc3R0UmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgIHZhciBzb3J0ZWQgPSByZXNwb25zZS5tb2RlbHMuc29ydChmdW5jdGlvbihhLGIpIHtcbiAgICBpZihhLm5hbWUgPiBiLm5hbWUpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgICBpZiggYS5uYW1lIDwgYi5uYW1lKSB7XG4gICAgICByZXR1cm4gLTE7XG4gICAgfVxuICAgIHJldHVybiAwO1xuICAgIH0pO1xuICAgIHJlc3BvbnNlLm1vZGVscz1zb3J0ZWQ7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ21vZGVscycsIEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLm1vZGVscykpO1xuICAgIHZpZXdDb250ZXh0Lm1vZGVscyA9IHJlc3BvbnNlLm1vZGVscztcbiAgICBzZWxlY3RNb2RlbCh2aWV3Q29udGV4dCk7XG4gIH07XG4gIHN0dFJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgIHZpZXdDb250ZXh0Lm1vZGVscyA9IHJlcXVpcmUoJy4vZGF0YS9tb2RlbHMuanNvbicpLm1vZGVscztcbiAgICBzZWxlY3RNb2RlbCh2aWV3Q29udGV4dCk7XG4gIH07XG4gIHN0dFJlcXVlc3Quc2VuZCgpO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLypnbG9iYWwgJDpmYWxzZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbnZhciBzaG93ZXJyb3IgPSByZXF1aXJlKCcuL3ZpZXdzL3Nob3dlcnJvcicpO1xudmFyIHNob3dFcnJvciA9IHNob3dlcnJvci5zaG93RXJyb3I7XG5cbi8vIE1pbmkgV1MgY2FsbGJhY2sgQVBJLCBzbyB3ZSBjYW4gaW5pdGlhbGl6ZVxuLy8gd2l0aCBtb2RlbCBhbmQgdG9rZW4gaW4gVVJJLCBwbHVzXG4vLyBzdGFydCBtZXNzYWdlXG5cbi8vIEluaXRpYWxpemUgY2xvc3VyZSwgd2hpY2ggaG9sZHMgbWF4aW11bSBnZXRUb2tlbiBjYWxsIGNvdW50XG52YXIgdG9rZW5HZW5lcmF0b3IgPSB1dGlscy5jcmVhdGVUb2tlbkdlbmVyYXRvcigpO1xuXG52YXIgaW5pdFNvY2tldCA9IGV4cG9ydHMuaW5pdFNvY2tldCA9IGZ1bmN0aW9uKG9wdGlvbnMsIG9ub3Blbiwgb25saXN0ZW5pbmcsIG9ubWVzc2FnZSwgb25lcnJvciwgb25jbG9zZSkge1xuICB2YXIgbGlzdGVuaW5nO1xuICBmdW5jdGlvbiB3aXRoRGVmYXVsdCh2YWwsIGRlZmF1bHRWYWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcgPyBkZWZhdWx0VmFsIDogdmFsO1xuICB9XG4gIHZhciBzb2NrZXQ7XG4gIHZhciB0b2tlbiA9IG9wdGlvbnMudG9rZW47XG4gIHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpO1xuICB2YXIgbWVzc2FnZSA9IG9wdGlvbnMubWVzc2FnZSB8fCB7J2FjdGlvbic6ICdzdGFydCd9O1xuICB2YXIgc2Vzc2lvblBlcm1pc3Npb25zID0gd2l0aERlZmF1bHQob3B0aW9ucy5zZXNzaW9uUGVybWlzc2lvbnMsXG4gICAgSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc2Vzc2lvblBlcm1pc3Npb25zJykpKTtcbiAgdmFyIHNlc3Npb25QZXJtaXNzaW9uc1F1ZXJ5UGFyYW0gPSBzZXNzaW9uUGVybWlzc2lvbnMgPyAnMCcgOiAnMSc7XG4gIHZhciB1cmwgPSBvcHRpb25zLnNlcnZpY2VVUkkgfHwgJ3dzczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL3JlY29nbml6ZT93YXRzb24tdG9rZW49JztcbiAgICB1cmwrPSB0b2tlbiArICcmWC1XREMtUEwtT1BULU9VVD0nICsgc2Vzc2lvblBlcm1pc3Npb25zUXVlcnlQYXJhbSArICcmbW9kZWw9JyArIG1vZGVsO1xuICBjb25zb2xlLmxvZygnVVJMIG1vZGVsJywgbW9kZWwpO1xuICB0cnkge1xuICAgIHNvY2tldCA9IG5ldyBXZWJTb2NrZXQodXJsKTtcbiAgfSBjYXRjaChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCdXUyBjb25uZWN0aW9uIGVycm9yOiAnLCBlcnIpO1xuICB9XG4gIHNvY2tldC5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICBsaXN0ZW5pbmcgPSBmYWxzZTtcbiAgICAkLnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnLCBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdNSUNST1BIT05FOiBjbG9zZS4nKTtcbiAgICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KHthY3Rpb246J3N0b3AnfSkpO1xuICAgICAgc29ja2V0LmNsb3NlKCk7XG4gICAgfSk7XG4gICAgJC5zdWJzY3JpYmUoJ3NvY2tldHN0b3AnLCBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdNSUNST1BIT05FOiBjbG9zZS4nKTtcbiAgICAgIHNvY2tldC5jbG9zZSgpO1xuICAgIH0pO1xuICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICBvbm9wZW4oc29ja2V0KTtcbiAgfTtcbiAgc29ja2V0Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGV2dCkge1xuICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcbiAgICBpZiAobXNnLmVycm9yKSB7XG4gICAgICBzaG93RXJyb3IobXNnLmVycm9yKTtcbiAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG1zZy5zdGF0ZSA9PT0gJ2xpc3RlbmluZycpIHtcbiAgICAgIC8vIEVhcmx5IGN1dCBvZmYsIHdpdGhvdXQgbm90aWZpY2F0aW9uXG4gICAgICBpZiAoIWxpc3RlbmluZykge1xuICAgICAgICBvbmxpc3RlbmluZyhzb2NrZXQpO1xuICAgICAgICBsaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ01JQ1JPUEhPTkU6IENsb3Npbmcgc29ja2V0LicpO1xuICAgICAgICBzb2NrZXQuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgb25tZXNzYWdlKG1zZywgc29ja2V0KTtcbiAgfTtcblxuICBzb2NrZXQub25lcnJvciA9IGZ1bmN0aW9uKGV2dCkge1xuICAgIGNvbnNvbGUubG9nKCdXUyBvbmVycm9yOiAnLCBldnQpO1xuICAgIHNob3dFcnJvcignQXBwbGljYXRpb24gZXJyb3IgJyArIGV2dC5jb2RlICsgJzogcGxlYXNlIHJlZnJlc2ggeW91ciBicm93c2VyIGFuZCB0cnkgYWdhaW4nKTtcbiAgICAkLnB1Ymxpc2goJ2NsZWFyc2NyZWVuJyk7XG4gICAgb25lcnJvcihldnQpO1xuICB9O1xuXG4gIHNvY2tldC5vbmNsb3NlID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgY29uc29sZS5sb2coJ1dTIG9uY2xvc2U6ICcsIGV2dCk7XG4gICAgaWYgKGV2dC5jb2RlID09PSAxMDA2KSB7XG4gICAgICAvLyBBdXRoZW50aWNhdGlvbiBlcnJvciwgdHJ5IHRvIHJlY29ubmVjdFxuICAgICAgY29uc29sZS5sb2coJ2dlbmVyYXRvciBjb3VudCcsIHRva2VuR2VuZXJhdG9yLmdldFNwZWVjaFRvVGV4dENvdW50KCkpO1xuICAgICAgaWYgKHRva2VuR2VuZXJhdG9yLmdldFNwZWVjaFRvVGV4dENvdW50KCkgPiAxKSB7XG4gICAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBhdXRob3JpemF0aW9uIHRva2VuIGlzIGN1cnJlbnRseSBhdmFpbGFibGUnKTtcbiAgICAgIH1cbiAgICAgIHRva2VuR2VuZXJhdG9yLmdldFRva2VuKGZ1bmN0aW9uKGVyciwgdG9rZW4pIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coJ0ZldGNoaW5nIGFkZGl0aW9uYWwgdG9rZW4uLi4nKTtcbiAgICAgICAgb3B0aW9ucy50b2tlbiA9IHRva2VuO1xuICAgICAgICBpbml0U29ja2V0KG9wdGlvbnMsIG9ub3Blbiwgb25saXN0ZW5pbmcsIG9ubWVzc2FnZSwgb25lcnJvciwgb25jbG9zZSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGV2dC5jb2RlID09PSAxMDExKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdTZXJ2ZXIgZXJyb3IgJyArIGV2dC5jb2RlICsgJzogcGxlYXNlIHJlZnJlc2ggeW91ciBicm93c2VyIGFuZCB0cnkgYWdhaW4nKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGV2dC5jb2RlID4gMTAwMCkge1xuICAgICAgY29uc29sZS5lcnJvcignU2VydmVyIGVycm9yICcgKyBldnQuY29kZSArICc6IHBsZWFzZSByZWZyZXNoIHlvdXIgYnJvd3NlciBhbmQgdHJ5IGFnYWluJyk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIE1hZGUgaXQgdGhyb3VnaCwgbm9ybWFsIGNsb3NlXG4gICAgJC51bnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAkLnVuc3Vic2NyaWJlKCdzb2NrZXRzdG9wJyk7XG4gICAgb25jbG9zZShldnQpO1xuICB9O1xuXG59O1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gRm9yIG5vbi12aWV3IGxvZ2ljXG52YXIgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydqUXVlcnknXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ2pRdWVyeSddIDogbnVsbCk7XG5cbnZhciBmaWxlQmxvY2sgPSBmdW5jdGlvbihfb2Zmc2V0LCBsZW5ndGgsIF9maWxlLCByZWFkQ2h1bmspIHtcbiAgdmFyIHIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICB2YXIgYmxvYiA9IF9maWxlLnNsaWNlKF9vZmZzZXQsIGxlbmd0aCArIF9vZmZzZXQpO1xuICByLm9ubG9hZCA9IHJlYWRDaHVuaztcbiAgci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKTtcbn07XG5cbi8vIEJhc2VkIG9uIGFsZWRpYWZlcmlhJ3MgU08gcmVzcG9uc2Vcbi8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTQ0MzgxODcvamF2YXNjcmlwdC1maWxlcmVhZGVyLXBhcnNpbmctbG9uZy1maWxlLWluLWNodW5rc1xuZXhwb3J0cy5vbkZpbGVQcm9ncmVzcyA9IGZ1bmN0aW9uKG9wdGlvbnMsIG9uZGF0YSwgcnVubmluZywgb25lcnJvciwgb25lbmQsIHNhbXBsaW5nUmF0ZSkge1xuICB2YXIgZmlsZSAgICAgICA9IG9wdGlvbnMuZmlsZTtcbiAgdmFyIGZpbGVTaXplICAgPSBmaWxlLnNpemU7XG4gIHZhciBjaHVua1NpemUgID0gb3B0aW9ucy5idWZmZXJTaXplIHx8IDE2MDAwOyAgLy8gaW4gYnl0ZXNcbiAgdmFyIG9mZnNldCAgICAgPSAwO1xuICB2YXIgcmVhZENodW5rID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgaWYgKG9mZnNldCA+PSBmaWxlU2l6ZSkge1xuICAgICAgY29uc29sZS5sb2coJ0RvbmUgcmVhZGluZyBmaWxlJyk7XG4gICAgICBvbmVuZCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZighcnVubmluZygpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldnQudGFyZ2V0LmVycm9yID09IG51bGwpIHtcbiAgICAgIHZhciBidWZmZXIgPSBldnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgIHZhciBsZW4gPSBidWZmZXIuYnl0ZUxlbmd0aDtcbiAgICAgIG9mZnNldCArPSBsZW47XG4gICAgICAvL2NvbnNvbGUubG9nKCdzZW5kaW5nOiAnICsgbGVuKTtcbiAgICAgIG9uZGF0YShidWZmZXIpOyAvLyBjYWxsYmFjayBmb3IgaGFuZGxpbmcgcmVhZCBjaHVua1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZXJyb3JNZXNzYWdlID0gZXZ0LnRhcmdldC5lcnJvcjtcbiAgICAgIGNvbnNvbGUubG9nKCdSZWFkIGVycm9yOiAnICsgZXJyb3JNZXNzYWdlKTtcbiAgICAgIG9uZXJyb3IoZXJyb3JNZXNzYWdlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gdXNlIHRoaXMgdGltZW91dCB0byBwYWNlIHRoZSBkYXRhIHVwbG9hZCBmb3IgdGhlIHBsYXlTYW1wbGUgY2FzZSxcbiAgICAvLyB0aGUgaWRlYSBpcyB0aGF0IHRoZSBoeXBzIGRvIG5vdCBhcnJpdmUgYmVmb3JlIHRoZSBhdWRpbyBpcyBwbGF5ZWQgYmFja1xuICAgIGlmIChzYW1wbGluZ1JhdGUpIHtcbiAgICBcdC8vIGNvbnNvbGUubG9nKCdzYW1wbGluZ1JhdGU6ICcgK1xuICAgICAgLy8gIHNhbXBsaW5nUmF0ZSArICcgdGltZW91dDogJyArIChjaHVua1NpemUgKiAxMDAwKSAvIChzYW1wbGluZ1JhdGUgKiAyKSk7XG4gICAgXHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIFx0ICBmaWxlQmxvY2sob2Zmc2V0LCBjaHVua1NpemUsIGZpbGUsIHJlYWRDaHVuayk7XG4gICAgXHR9LCAoY2h1bmtTaXplICogMTAwMCkgLyAoc2FtcGxpbmdSYXRlICogMikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlQmxvY2sob2Zmc2V0LCBjaHVua1NpemUsIGZpbGUsIHJlYWRDaHVuayk7XG4gICAgfVxuICB9O1xuICBmaWxlQmxvY2sob2Zmc2V0LCBjaHVua1NpemUsIGZpbGUsIHJlYWRDaHVuayk7XG59O1xuXG5leHBvcnRzLmNyZWF0ZUFsY2hlbXlQcm94eSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4ge1xuICAgIGdldEFsY2hlbXlSZWxhdGlvbnM6IGZ1bmN0aW9uKHRleHQsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXJsID0gJy9hcGkvYWxjaGVteS1yZWxhdGlvbnMnO1xuICAgICAgdmFyIHJlbGF0aW9uc1JlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgcmVsYXRpb25zUmVxdWVzdC5vcGVuKCdQT1NUJywgdXJsLCB0cnVlKTtcbiAgICAgIHJlbGF0aW9uc1JlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignY3NyZi10b2tlbicsICQoJ21ldGFbbmFtZT1cImN0XCJdJykuYXR0cignY29udGVudCcpKTtcbiAgICAgIHJlbGF0aW9uc1JlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC10eXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblxuICAgICAgcmVsYXRpb25zUmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHJlbGF0aW9uc1JlcXVlc3QucmVhZHlTdGF0ZSAhPT0gNCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZWxhdGlvbnNSZXF1ZXN0LnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgdmFyIHJlc3AgPSBKU09OLnBhcnNlKHJlbGF0aW9uc1JlcXVlc3QucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXNwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgZXJyb3IgPSAnQ2Fubm90IHJlYWNoIHNlcnZlcic7XG4gICAgICAgICAgaWYgKHJlbGF0aW9uc1JlcXVlc3QucmVzcG9uc2VUZXh0KSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBlcnJvciA9IEpTT04ucGFyc2UocmVsYXRpb25zUmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBlcnJvciA9IHJlbGF0aW9uc1JlcXVlc3QucmVzcG9uc2VUZXh0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNhbGxiYWNrKGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgcmVsYXRpb25zUmVxdWVzdC5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdGV4dDogdGV4dCB9KSk7XG4gICAgfVxuICB9O1xufTtcblxuZXhwb3J0cy5jcmVhdGVUb2tlbkdlbmVyYXRvciA9IGZ1bmN0aW9uKCkge1xuICAvLyBNYWtlIGNhbGwgdG8gQVBJIHRvIHRyeSBhbmQgZ2V0IHRva2VuXG4gIHZhciBfc3BlZWNoVG9UZXh0SGFzQmVlblJ1blRpbWVzID0gMDtcbiAgcmV0dXJuIHtcbiAgICBnZXRTcGVlY2hUb1RleHRUb2tlbjogZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICsrX3NwZWVjaFRvVGV4dEhhc0JlZW5SdW5UaW1lcztcbiAgICAgIGlmIChfc3BlZWNoVG9UZXh0SGFzQmVlblJ1blRpbWVzID4gNSkge1xuICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdDYW5ub3QgcmVhY2ggc2VydmVyJyk7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIGVycik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciB1cmwgPSAnL2FwaS9zcGVlY2gtdG8tdGV4dC10b2tlbic7XG4gICAgICB2YXIgdG9rZW5SZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICB0b2tlblJlcXVlc3Qub3BlbignUE9TVCcsIHVybCwgdHJ1ZSk7XG4gICAgICB0b2tlblJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignY3NyZi10b2tlbicsJCgnbWV0YVtuYW1lPVwiY3RcIl0nKS5hdHRyKCdjb250ZW50JykpO1xuICAgICAgdG9rZW5SZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodG9rZW5SZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICBpZiAodG9rZW5SZXF1ZXN0LnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSB0b2tlblJlcXVlc3QucmVzcG9uc2VUZXh0O1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgdG9rZW4pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZXJyb3IgPSAnQ2Fubm90IHJlYWNoIHNlcnZlcic7XG4gICAgICAgICAgICBpZiAodG9rZW5SZXF1ZXN0LnJlc3BvbnNlVGV4dCl7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXJyb3IgPSBKU09OLnBhcnNlKHRva2VuUmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IgPSB0b2tlblJlcXVlc3QucmVzcG9uc2VUZXh0O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjayhlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgdG9rZW5SZXF1ZXN0LnNlbmQoKTtcbiAgICB9LFxuICAgIGdldFNwZWVjaFRvVGV4dENvdW50OiBmdW5jdGlvbigpIHsgcmV0dXJuIF9zcGVlY2hUb1RleHRIYXNCZWVuUnVuVGltZXM7IH1cbiAgfTtcbn07XG5cbmV4cG9ydHMuaW5pdFB1YlN1YiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbyAgICAgICAgID0gJCh7fSk7XG4gICQuc3Vic2NyaWJlICAgPSBvLm9uLmJpbmQobyk7XG4gICQudW5zdWJzY3JpYmUgPSBvLm9mZi5iaW5kKG8pO1xuICAkLnB1Ymxpc2ggICAgID0gby50cmlnZ2VyLmJpbmQobyk7XG59O1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vKiBnbG9iYWwgJCAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5cbmV4cG9ydHMuaW5pdEFuaW1hdGVQYW5lbCA9IGZ1bmN0aW9uKCkge1xuICAkKCcucGFuZWwtaGVhZGluZyBzcGFuLmNsaWNrYWJsZScpLm9uKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoJCh0aGlzKS5oYXNDbGFzcygncGFuZWwtY29sbGFwc2VkJykpIHtcbiAgICAgIC8vIGV4cGFuZCB0aGUgcGFuZWxcbiAgICAgICQodGhpcykucGFyZW50cygnLnBhbmVsJykuZmluZCgnLnBhbmVsLWJvZHknKS5zbGlkZURvd24oKTtcbiAgICAgICQodGhpcykucmVtb3ZlQ2xhc3MoJ3BhbmVsLWNvbGxhcHNlZCcpO1xuICAgICAgJCh0aGlzKS5maW5kKCdpJykucmVtb3ZlQ2xhc3MoJ2NhcmV0LWRvd24nKS5hZGRDbGFzcygnY2FyZXQtdXAnKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAvLyBjb2xsYXBzZSB0aGUgcGFuZWxcbiAgICAgICQodGhpcykucGFyZW50cygnLnBhbmVsJykuZmluZCgnLnBhbmVsLWJvZHknKS5zbGlkZVVwKCk7XG4gICAgICAkKHRoaXMpLmFkZENsYXNzKCdwYW5lbC1jb2xsYXBzZWQnKTtcbiAgICAgICQodGhpcykuZmluZCgnaScpLnJlbW92ZUNsYXNzKCdjYXJldC11cCcpLmFkZENsYXNzKCdjYXJldC1kb3duJyk7XG4gICAgfVxuICB9KTtcbn07XG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE0IElCTSBDb3JwLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCAkICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzY3JvbGxlZCA9IGZhbHNlLFxuICAgIHRleHRTY3JvbGxlZCA9IGZhbHNlO1xuXG52YXIgc2hvd1RpbWVzdGFtcCA9IGZ1bmN0aW9uKHRpbWVzdGFtcHMsIGNvbmZpZGVuY2VzKSB7XG4gIHZhciB3b3JkID0gdGltZXN0YW1wc1swXSxcbiAgICAgIHQwID0gdGltZXN0YW1wc1sxXSxcbiAgICAgIHQxID0gdGltZXN0YW1wc1syXTtcblxuICAvLyBTaG93IGNvbmZpZGVuY2UgaWYgZGVmaW5lZCwgZWxzZSAnbi9hJ1xuICB2YXIgZGlzcGxheUNvbmZpZGVuY2UgPSBjb25maWRlbmNlcyA/IGNvbmZpZGVuY2VzWzFdLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDAsIDMpIDogJ24vYSc7XG4gICQoJyNtZXRhZGF0YVRhYmxlID4gdGJvZHk6bGFzdC1jaGlsZCcpLmFwcGVuZChcbiAgICAgICc8dHI+J1xuICAgICAgKyAnPHRkPicgKyB3b3JkICsgJzwvdGQ+J1xuICAgICAgKyAnPHRkPicgKyB0MCArICc8L3RkPidcbiAgICAgICsgJzx0ZD4nICsgdDEgKyAnPC90ZD4nXG4gICAgICArICc8dGQ+JyArIGRpc3BsYXlDb25maWRlbmNlICsgJzwvdGQ+J1xuICAgICAgKyAnPC90cj4nXG4gICAgICApO1xufTtcblxuXG52YXIgc2hvd01ldGFEYXRhID0gZnVuY3Rpb24oYWx0ZXJuYXRpdmUpIHtcbiAgdmFyIGNvbmZpZGVuY2VOZXN0ZWRBcnJheSA9IGFsdGVybmF0aXZlLndvcmRfY29uZmlkZW5jZTtcbiAgdmFyIHRpbWVzdGFtcE5lc3RlZEFycmF5ID0gYWx0ZXJuYXRpdmUudGltZXN0YW1wcztcbiAgaWYgKGNvbmZpZGVuY2VOZXN0ZWRBcnJheSAmJiBjb25maWRlbmNlTmVzdGVkQXJyYXkubGVuZ3RoID4gMCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlkZW5jZU5lc3RlZEFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdGltZXN0YW1wcyA9IHRpbWVzdGFtcE5lc3RlZEFycmF5W2ldO1xuICAgICAgdmFyIGNvbmZpZGVuY2VzID0gY29uZmlkZW5jZU5lc3RlZEFycmF5W2ldO1xuICAgICAgc2hvd1RpbWVzdGFtcCh0aW1lc3RhbXBzLCBjb25maWRlbmNlcyk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfSBlbHNlIHtcbiAgICBpZiAodGltZXN0YW1wTmVzdGVkQXJyYXkgJiYgdGltZXN0YW1wTmVzdGVkQXJyYXkubGVuZ3RoID4gMCkge1xuICAgICAgdGltZXN0YW1wTmVzdGVkQXJyYXkuZm9yRWFjaChmdW5jdGlvbih0aW1lc3RhbXApIHtcbiAgICAgICAgc2hvd1RpbWVzdGFtcCh0aW1lc3RhbXApO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG59O1xuXG52YXIgQWx0ZXJuYXRpdmVzID0gZnVuY3Rpb24oKXtcblxuICB2YXIgc3RyaW5nT25lID0gJycsXG4gICAgc3RyaW5nVHdvID0gJycsXG4gICAgc3RyaW5nVGhyZWUgPSAnJztcblxuICB0aGlzLmNsZWFyU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgc3RyaW5nT25lID0gJyc7XG4gICAgc3RyaW5nVHdvID0gJyc7XG4gICAgc3RyaW5nVGhyZWUgPSAnJztcbiAgfTtcblxuICB0aGlzLnNob3dBbHRlcm5hdGl2ZXMgPSBmdW5jdGlvbihhbHRlcm5hdGl2ZXMsIGlzRmluYWwsIHRlc3RpbmcpIHtcbiAgICB2YXIgJGh5cG90aGVzZXMgPSAkKCcuaHlwb3RoZXNlcyBvbCcpO1xuICAgICRoeXBvdGhlc2VzLmVtcHR5KCk7XG4gICAgLy8gJGh5cG90aGVzZXMuYXBwZW5kKCQoJzwvYnI+JykpO1xuICAgIGFsdGVybmF0aXZlcy5mb3JFYWNoKGZ1bmN0aW9uKGFsdGVybmF0aXZlLCBpZHgpIHtcbiAgICAgIHZhciAkYWx0ZXJuYXRpdmU7XG4gICAgICBpZiAoYWx0ZXJuYXRpdmUudHJhbnNjcmlwdCkge1xuICAgICAgICB2YXIgdHJhbnNjcmlwdCA9IGFsdGVybmF0aXZlLnRyYW5zY3JpcHQucmVwbGFjZSgvJUhFU0lUQVRJT05cXHMvZywgJycpO1xuICAgICAgICB0cmFuc2NyaXB0ID0gdHJhbnNjcmlwdC5yZXBsYWNlKC8oLilcXDF7Mix9L2csICcnKTtcbiAgICAgICAgc3dpdGNoIChpZHgpIHtcbiAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICBzdHJpbmdPbmUgPSBzdHJpbmdPbmUgKyB0cmFuc2NyaXB0O1xuICAgICAgICAgICAgJGFsdGVybmF0aXZlID0gJCgnPGxpIGRhdGEtaHlwb3RoZXNpcy1pbmRleD0nICsgaWR4ICsgJyA+JyArIHN0cmluZ09uZSArICc8L2xpPicpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgc3RyaW5nVHdvID0gc3RyaW5nVHdvICsgdHJhbnNjcmlwdDtcbiAgICAgICAgICAgICRhbHRlcm5hdGl2ZSA9ICQoJzxsaSBkYXRhLWh5cG90aGVzaXMtaW5kZXg9JyArIGlkeCArICcgPicgKyBzdHJpbmdUd28gKyAnPC9saT4nKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgIHN0cmluZ1RocmVlID0gc3RyaW5nVGhyZWUgKyB0cmFuc2NyaXB0O1xuICAgICAgICAgICAgJGFsdGVybmF0aXZlID0gJCgnPGxpIGRhdGEtaHlwb3RoZXNpcy1pbmRleD0nICsgaWR4ICsgJyA+JyArIHN0cmluZ1RocmVlICsgJzwvbGk+Jyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAkaHlwb3RoZXNlcy5hcHBlbmQoJGFsdGVybmF0aXZlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn07XG5cbnZhciBhbHRlcm5hdGl2ZVByb3RvdHlwZSA9IG5ldyBBbHRlcm5hdGl2ZXMoKTtcblxuZXhwb3J0cy5zaG93SlNPTiA9IGZ1bmN0aW9uKG1zZywgYmFzZUpTT04pIHtcblxuICAgdmFyIGpzb24gPSBKU09OLnN0cmluZ2lmeShtc2csIG51bGwsIDIpO1xuICAgIGJhc2VKU09OICs9IGpzb247XG4gICAgYmFzZUpTT04gKz0gJ1xcbic7XG5cbiAgaWYgKCQoJy5uYXYtdGFicyAuYWN0aXZlJykudGV4dCgpID09PSAnSlNPTicpIHtcbiAgICAgICQoJyNyZXN1bHRzSlNPTicpLmFwcGVuZChiYXNlSlNPTik7XG4gICAgICBiYXNlSlNPTiA9ICcnO1xuICAgICAgY29uc29sZS5sb2coJ3VwZGF0aW5nIGpzb24nKTtcbiAgfVxuXG4gIHJldHVybiBiYXNlSlNPTjtcbn07XG5cbmZ1bmN0aW9uIHVwZGF0ZVRleHRTY3JvbGwoKXtcbiAgaWYoIXNjcm9sbGVkKXtcbiAgICB2YXIgZWxlbWVudCA9ICQoJyNyZXN1bHRzVGV4dCcpLmdldCgwKTtcbiAgICBlbGVtZW50LnNjcm9sbFRvcCA9IGVsZW1lbnQuc2Nyb2xsSGVpZ2h0O1xuICB9XG59XG5cbnZhciBpbml0VGV4dFNjcm9sbCA9IGZ1bmN0aW9uKCkge1xuICAkKCcjcmVzdWx0c1RleHQnKS5vbignc2Nyb2xsJywgZnVuY3Rpb24oKXtcbiAgICAgIHRleHRTY3JvbGxlZCA9IHRydWU7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdXBkYXRlU2Nyb2xsKCl7XG4gIGlmKCFzY3JvbGxlZCl7XG4gICAgdmFyIGVsZW1lbnQgPSAkKCcudGFibGUtc2Nyb2xsJykuZ2V0KDApO1xuICAgIGVsZW1lbnQuc2Nyb2xsVG9wID0gZWxlbWVudC5zY3JvbGxIZWlnaHQ7XG4gIH1cbn1cblxudmFyIGluaXRTY3JvbGwgPSBmdW5jdGlvbigpIHtcbiAgJCgnLnRhYmxlLXNjcm9sbCcpLm9uKCdzY3JvbGwnLCBmdW5jdGlvbigpe1xuICAgICAgc2Nyb2xsZWQ9dHJ1ZTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLmluaXREaXNwbGF5TWV0YWRhdGEgPSBmdW5jdGlvbigpIHtcbiAgaW5pdFNjcm9sbCgpO1xuICBpbml0VGV4dFNjcm9sbCgpO1xufTtcblxuXG5leHBvcnRzLnNob3dSZXN1bHQgPSBmdW5jdGlvbihtc2csIGJhc2VTdHJpbmcsIG1vZGVsKSB7XG4gIGlmIChtc2cucmVzdWx0cyAmJiBtc2cucmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cbiAgICB2YXIgYWx0ZXJuYXRpdmVzID0gbXNnLnJlc3VsdHNbMF0uYWx0ZXJuYXRpdmVzO1xuICAgIHZhciB0ZXh0ID0gbXNnLnJlc3VsdHNbMF0uYWx0ZXJuYXRpdmVzWzBdLnRyYW5zY3JpcHQgfHwgJyc7XG5cbiAgICAvLyBhcHBseSBtYXBwaW5ncyB0byBiZWF1dGlmeVxuICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoLyVIRVNJVEFUSU9OXFxzL2csICcnKTtcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC8oLilcXDF7Mix9L2csICcnKTtcbiAgICBpZiAobXNnLnJlc3VsdHNbMF0uZmluYWwpXG4gICAgICAgY29uc29sZS5sb2coJy0+ICcgKyB0ZXh0KTtcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9EX1teXFxzXSsvZywnJyk7XG5cbiAgICAvLyBpZiBhbGwgd29yZHMgYXJlIG1hcHBlZCB0byBub3RoaW5nIHRoZW4gdGhlcmUgaXMgbm90aGluZyBlbHNlIHRvIGRvXG4gICAgaWYgKCh0ZXh0Lmxlbmd0aCA9PT0gMCkgfHwgKC9eXFxzKyQvLnRlc3QodGV4dCkpKSB7XG4gICAgXHQgcmV0dXJuIGJhc2VTdHJpbmc7XG4gICAgfVxuXG4gICAgLy8gY2FwaXRhbGl6ZSBmaXJzdCB3b3JkXG4gICAgLy8gaWYgZmluYWwgcmVzdWx0cywgYXBwZW5kIGEgbmV3IHBhcmFncmFwaFxuICAgIGlmIChtc2cucmVzdWx0cyAmJiBtc2cucmVzdWx0c1swXSAmJiBtc2cucmVzdWx0c1swXS5maW5hbCkge1xuICAgICAgIHRleHQgPSB0ZXh0LnNsaWNlKDAsIC0xKTtcbiAgICAgICB0ZXh0ID0gdGV4dC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHRleHQuc3Vic3RyaW5nKDEpO1xuICAgICAgICB0ZXh0ID0gdGV4dC50cmltKCkgKyAnLiAnO1xuICAgICAgIGJhc2VTdHJpbmcgKz0gdGV4dDtcbiAgICAgICAkKCcjcmVzdWx0c1RleHQnKS52YWwoYmFzZVN0cmluZyk7XG4gICAgICAgc2hvd01ldGFEYXRhKGFsdGVybmF0aXZlc1swXSk7XG4gICAgICAgLy8gT25seSBzaG93IGFsdGVybmF0aXZlcyBpZiB3ZSdyZSBmaW5hbFxuICAgICAgIGFsdGVybmF0aXZlUHJvdG90eXBlLnNob3dBbHRlcm5hdGl2ZXMoYWx0ZXJuYXRpdmVzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy90ZXh0ID0gdGV4dC5yZXBsYWNlKC8gL2csJycpOyAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlc1xuICAgICAgdGV4dCA9IHRleHQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB0ZXh0LnN1YnN0cmluZygxKTtcbiAgICAgICQoJyNyZXN1bHRzVGV4dCcpLnZhbChiYXNlU3RyaW5nICsgdGV4dCk7XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlU2Nyb2xsKCk7XG4gIHVwZGF0ZVRleHRTY3JvbGwoKTtcbiAgcmV0dXJuIGJhc2VTdHJpbmc7XG59O1xuXG4kLnN1YnNjcmliZSgnY2xlYXJzY3JlZW4nLCBmdW5jdGlvbigpIHtcbiAgdmFyICRoeXBvdGhlc2VzID0gJCgnLmh5cG90aGVzZXMgdWwnKTtcbiAgc2Nyb2xsZWQgPSBmYWxzZTtcbiAgJGh5cG90aGVzZXMuZW1wdHkoKTtcbiAgYWx0ZXJuYXRpdmVQcm90b3R5cGUuY2xlYXJTdHJpbmcoKTtcbn0pO1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vKiBnbG9iYWwgJCAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFuZGxlU2VsZWN0ZWRGaWxlID0gcmVxdWlyZSgnLi9maWxldXBsb2FkJykuaGFuZGxlU2VsZWN0ZWRGaWxlO1xuXG5leHBvcnRzLmluaXREcmFnRHJvcCA9IGZ1bmN0aW9uKGN0eCkge1xuXG4gIHZhciBkcmFnQW5kRHJvcFRhcmdldCA9ICQoZG9jdW1lbnQpO1xuXG4gIGRyYWdBbmREcm9wVGFyZ2V0Lm9uKCdkcmFnZW50ZXInLCBmdW5jdGlvbiAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB9KTtcblxuICBkcmFnQW5kRHJvcFRhcmdldC5vbignZHJhZ292ZXInLCBmdW5jdGlvbiAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB9KTtcblxuICBkcmFnQW5kRHJvcFRhcmdldC5vbignZHJvcCcsIGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coJ0ZpbGUgZHJvcHBlZCcpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB2YXIgZXZ0ID0gZS5vcmlnaW5hbEV2ZW50O1xuICAgIC8vIEhhbmRsZSBkcmFnZ2VkIGZpbGUgZXZlbnRcbiAgICBoYW5kbGVGaWxlVXBsb2FkRXZlbnQoZXZ0KTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gaGFuZGxlRmlsZVVwbG9hZEV2ZW50KGV2dCkge1xuICAgIC8vIEluaXQgZmlsZSB1cGxvYWQgd2l0aCBkZWZhdWx0IG1vZGVsXG4gICAgdmFyIGZpbGUgPSBldnQuZGF0YVRyYW5zZmVyLmZpbGVzWzBdO1xuICAgIGhhbmRsZVNlbGVjdGVkRmlsZShjdHgudG9rZW4sIGZpbGUpO1xuICB9XG5cbn07XG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE0IElCTSBDb3JwLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCAkICovXG4ndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZmxhc2hTVkcgPSBmdW5jdGlvbihlbCkge1xuICBlbC5jc3MoeyBmaWxsOiAnI0E1MzcyNScgfSk7XG4gIGZ1bmN0aW9uIGxvb3AoKSB7XG4gICAgZWwuYW5pbWF0ZSh7IGZpbGw6ICcjQTUzNzI1JyB9LFxuICAgICAgICAxMDAwLCAnbGluZWFyJylcbiAgICAgIC5hbmltYXRlKHsgZmlsbDogJ3doaXRlJyB9LFxuICAgICAgICAgIDEwMDAsICdsaW5lYXInKTtcbiAgfVxuICAvLyByZXR1cm4gdGltZXJcbiAgdmFyIHRpbWVyID0gc2V0VGltZW91dChsb29wLCAyMDAwKTtcbiAgcmV0dXJuIHRpbWVyO1xufTtcblxuZXhwb3J0cy5zdG9wRmxhc2hTVkcgPSBmdW5jdGlvbih0aW1lcikge1xuICBlbC5jc3MoeyBmaWxsOiAnd2hpdGUnIH0gKTtcbiAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XG59O1xuXG5leHBvcnRzLnRvZ2dsZUltYWdlID0gZnVuY3Rpb24oZWwsIG5hbWUpIHtcbiAgaWYoZWwuYXR0cignc3JjJykgPT09ICdpbWFnZXMvJyArIG5hbWUgKyAnLnN2ZycpIHtcbiAgICBlbC5hdHRyKCdzcmMnLCAnaW1hZ2VzL3N0b3AtcmVkLnN2ZycpO1xuICB9IGVsc2Uge1xuICAgIGVsLmF0dHIoJ3NyYycsICdpbWFnZXMvc3RvcC5zdmcnKTtcbiAgfVxufTtcblxudmFyIHJlc3RvcmVJbWFnZSA9IGV4cG9ydHMucmVzdG9yZUltYWdlID0gZnVuY3Rpb24oZWwsIG5hbWUpIHtcbiAgZWwuYXR0cignc3JjJywgJ2ltYWdlcy8nICsgbmFtZSArICcuc3ZnJyk7XG59O1xuXG5leHBvcnRzLnN0b3BUb2dnbGVJbWFnZSA9IGZ1bmN0aW9uKHRpbWVyLCBlbCwgbmFtZSkge1xuICBjbGVhckludGVydmFsKHRpbWVyKTtcbiAgcmVzdG9yZUltYWdlKGVsLCBuYW1lKTtcbn07XG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE0IElCTSBDb3JwLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCAkICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzaG93RXJyb3IgPSByZXF1aXJlKCcuL3Nob3dlcnJvcicpLnNob3dFcnJvcjtcbnZhciBzaG93Tm90aWNlID0gcmVxdWlyZSgnLi9zaG93ZXJyb3InKS5zaG93Tm90aWNlO1xudmFyIGhhbmRsZUZpbGVVcGxvYWQgPSByZXF1aXJlKCcuLi9oYW5kbGVmaWxldXBsb2FkJykuaGFuZGxlRmlsZVVwbG9hZDtcbnZhciBlZmZlY3RzID0gcmVxdWlyZSgnLi9lZmZlY3RzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vLyBOZWVkIHRvIHJlbW92ZSB0aGUgdmlldyBsb2dpYyBoZXJlIGFuZCBtb3ZlIHRoaXMgb3V0IHRvIHRoZSBoYW5kbGVmaWxldXBsb2FkIGNvbnRyb2xsZXJcbnZhciBoYW5kbGVTZWxlY3RlZEZpbGUgPSBleHBvcnRzLmhhbmRsZVNlbGVjdGVkRmlsZSA9IChmdW5jdGlvbigpIHtcblxuICAgIHZhciBydW5uaW5nID0gZmFsc2U7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCAnZmFsc2UnKTtcblxuICAgIHJldHVybiBmdW5jdGlvbih0b2tlbiwgZmlsZSkge1xuXG4gICAgJC5wdWJsaXNoKCdjbGVhcnNjcmVlbicpO1xuXG4gICAgXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCAnZmlsZXVwbG9hZCcpO1xuICAgIHJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgLy8gVmlzdWFsIGVmZmVjdHNcbiAgICB2YXIgdXBsb2FkSW1hZ2VUYWcgPSAkKCcjZmlsZVVwbG9hZFRhcmdldCA+IGltZycpO1xuICAgIHZhciB0aW1lciA9IHNldEludGVydmFsKGVmZmVjdHMudG9nZ2xlSW1hZ2UsIDc1MCwgdXBsb2FkSW1hZ2VUYWcsICdzdG9wJyk7XG4gICAgdmFyIHVwbG9hZFRleHQgPSAkKCcjZmlsZVVwbG9hZFRhcmdldCA+IHNwYW4nKTtcbiAgICB1cGxvYWRUZXh0LnRleHQoJ1N0b3AgVHJhbnNjcmliaW5nJyk7XG5cbiAgICBmdW5jdGlvbiByZXN0b3JlVXBsb2FkVGFiKCkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XG4gICAgICBlZmZlY3RzLnJlc3RvcmVJbWFnZSh1cGxvYWRJbWFnZVRhZywgJ3VwbG9hZCcpO1xuICAgICAgdXBsb2FkVGV4dC50ZXh0KCdTZWxlY3QgRmlsZScpO1xuICAgIH1cblxuICAgIC8vIENsZWFyIGZsYXNoaW5nIGlmIHNvY2tldCB1cGxvYWQgaXMgc3RvcHBlZFxuICAgICQuc3Vic2NyaWJlKCdoYXJkc29ja2V0c3RvcCcsIGZ1bmN0aW9uKCkge1xuICAgICAgcmVzdG9yZVVwbG9hZFRhYigpO1xuICAgICAgcnVubmluZyA9IGZhbHNlO1xuICAgIH0pO1xuXG4gICAgLy8gR2V0IGN1cnJlbnQgbW9kZWxcbiAgICB2YXIgY3VycmVudE1vZGVsID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpO1xuICAgIGNvbnNvbGUubG9nKCdjdXJyZW50TW9kZWwnLCBjdXJyZW50TW9kZWwpO1xuXG4gICAgLy8gUmVhZCBmaXJzdCA0IGJ5dGVzIHRvIGRldGVybWluZSBoZWFkZXJcbiAgICB2YXIgYmxvYlRvVGV4dCA9IG5ldyBCbG9iKFtmaWxlXSkuc2xpY2UoMCwgNCk7XG4gICAgdmFyIHIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgIHIucmVhZEFzVGV4dChibG9iVG9UZXh0KTtcbiAgICByLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKHIucmVzdWx0ID09PSAnZkxhQycpIHtcbiAgICAgICAgY29udGVudFR5cGUgPSAnYXVkaW8vZmxhYyc7XG4gICAgICAgIHNob3dOb3RpY2UoJ05vdGljZTogYnJvd3NlcnMgZG8gbm90IHN1cHBvcnQgcGxheWluZyBGTEFDIGF1ZGlvLCBzbyBubyBhdWRpbyB3aWxsIGFjY29tcGFueSB0aGUgdHJhbnNjcmlwdGlvbicpO1xuICAgICAgfSBlbHNlIGlmIChyLnJlc3VsdCA9PT0gJ1JJRkYnKSB7XG4gICAgICAgIGNvbnRlbnRUeXBlID0gJ2F1ZGlvL3dhdic7XG4gICAgICAgIHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuICAgICAgICB2YXIgd2F2QmxvYiA9IG5ldyBCbG9iKFtmaWxlXSwge3R5cGU6ICdhdWRpby93YXYnfSk7XG4gICAgICAgIHZhciB3YXZVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHdhdkJsb2IpO1xuICAgICAgICBhdWRpby5zcmMgPSB3YXZVUkw7XG4gICAgICAgIGF1ZGlvLnBsYXkoKTtcbiAgICAgICAgJC5zdWJzY3JpYmUoJ2hhcmRzb2NrZXRzdG9wJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgYXVkaW8ucGF1c2UoKTtcbiAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmIChyLnJlc3VsdCA9PT0gJ09nZ1MnKSB7XG4gICAgICAgIGNvbnRlbnRUeXBlID0gJ2F1ZGlvL29nZzsgY29kZWNzPW9wdXMnO1xuICAgICAgICB2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcbiAgICAgICAgdmFyIG9wdXNCbG9iID0gbmV3IEJsb2IoW2ZpbGVdLCB7dHlwZTogJ2F1ZGlvL29nZzsgY29kZWNzPW9wdXMnfSk7XG4gICAgICAgIHZhciBvcHVzVVJMID0gVVJMLmNyZWF0ZU9iamVjdFVSTChvcHVzQmxvYik7XG4gICAgICAgIGF1ZGlvLnNyYz1vcHVzVVJMO1xuICAgICAgICBhdWRpby5wbGF5KCk7XG4gICAgICAgICQuc3Vic2NyaWJlKCdoYXJkc29ja2V0c3RvcCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgYXVkaW8ucGF1c2UoKTtcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0b3JlVXBsb2FkVGFiKCk7XG4gICAgICAgIHNob3dFcnJvcignT25seSBXQVYgb3IgRkxBQyBvciBPcHVzIGZpbGVzIGNhbiBiZSB0cmFuc2NyaWJlZCwgcGxlYXNlIHRyeSBhbm90aGVyIGZpbGUgZm9ybWF0Jyk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgJ2ZhbHNlJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGhhbmRsZUZpbGVVcGxvYWQoJ2ZpbGV1cGxvYWQnLCB0b2tlbiwgY3VycmVudE1vZGVsLCBmaWxlLCBjb250ZW50VHlwZSwgZnVuY3Rpb24oc29ja2V0KSB7XG4gICAgICAgIHZhciBibG9iID0gbmV3IEJsb2IoW2ZpbGVdKTtcbiAgICAgICAgdmFyIHBhcnNlT3B0aW9ucyA9IHtcbiAgICAgICAgICBmaWxlOiBibG9iXG4gICAgICAgIH07XG4gICAgICAgIHV0aWxzLm9uRmlsZVByb2dyZXNzKHBhcnNlT3B0aW9ucyxcbiAgICAgICAgICAvLyBPbiBkYXRhIGNodW5rXG4gICAgICAgICAgZnVuY3Rpb24gb25EYXRhKGNodW5rKSB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZChjaHVuayk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiBpc1J1bm5pbmcoKSB7XG4gICAgICAgICAgICBpZihydW5uaW5nKVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIE9uIGZpbGUgcmVhZCBlcnJvclxuICAgICAgICAgIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0Vycm9yIHJlYWRpbmcgZmlsZTogJywgZXZ0Lm1lc3NhZ2UpO1xuICAgICAgICAgICAgc2hvd0Vycm9yKCdFcnJvcjogJyArIGV2dC5tZXNzYWdlKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIE9uIGxvYWQgZW5kXG4gICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeSh7J2FjdGlvbic6ICdzdG9wJ30pKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGVmZmVjdHMuc3RvcFRvZ2dsZUltYWdlKHRpbWVyLCB1cGxvYWRJbWFnZVRhZywgJ3VwbG9hZCcpO1xuICAgICAgICAgIHVwbG9hZFRleHQudGV4dCgnU2VsZWN0IEZpbGUnKTtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsICdmYWxzZScpO1xuICAgICAgICB9XG4gICAgICApO1xuICAgIH07XG4gIH07XG59KSgpO1xuXG5cbmV4cG9ydHMuaW5pdEZpbGVVcGxvYWQgPSBmdW5jdGlvbihjdHgpIHtcblxuICB2YXIgZmlsZVVwbG9hZERpYWxvZyA9ICQoJyNmaWxlVXBsb2FkRGlhbG9nJyk7XG5cbiAgZmlsZVVwbG9hZERpYWxvZy5jaGFuZ2UoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZpbGUgPSBmaWxlVXBsb2FkRGlhbG9nLmdldCgwKS5maWxlc1swXTtcbiAgICBoYW5kbGVTZWxlY3RlZEZpbGUoY3R4LnRva2VuLCBmaWxlKTtcbiAgfSk7XG5cbiAgJCgnI2ZpbGVVcGxvYWRUYXJnZXQnKS5jbGljayhmdW5jdGlvbigpIHtcblxuICAgIHZhciBjdXJyZW50bHlEaXNwbGF5aW5nID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnKTtcblxuICAgIGlmIChjdXJyZW50bHlEaXNwbGF5aW5nPT0nZmlsZXVwbG9hZCcpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdIQVJEIFNPQ0tFVCBTVE9QJyk7XG4gICAgICAkLnB1Ymxpc2goJ2hhcmRzb2NrZXRzdG9wJyk7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsICdmYWxzZScpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoY3VycmVudGx5RGlzcGxheWluZz09J3NhbXBsZScpIHtcbiAgICAgIHNob3dFcnJvcignQ3VycmVudGx5IGFub3RoZXIgZmlsZSBpcyBwbGF5aW5nLCBwbGVhc2Ugc3RvcCB0aGUgZmlsZSBvciB3YWl0IHVudGlsIGl0IGZpbmlzaGVzJyk7IFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoY3VycmVudGx5RGlzcGxheWluZz09J3JlY29yZCcpIHtcbiAgICAgIHNob3dFcnJvcignQ3VycmVudGx5IGF1ZGlvIGlzIGJlaW5nIHJlY29yZGVkLCBwbGVhc2Ugc3RvcCByZWNvcmRpbmcgYmVmb3JlIHBsYXlpbmcgYSBzYW1wbGUnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmlsZVVwbG9hZERpYWxvZy52YWwobnVsbCk7XG5cbiAgICBmaWxlVXBsb2FkRGlhbG9nXG4gICAgLnRyaWdnZXIoJ2NsaWNrJyk7XG5cbiAgfSk7XG5cbn07XG4iLCIvKiBnbG9iYWwgUGhhc2VyICovXG5cbnZhciBnYW1lO1xuXG5mdW5jdGlvbiBpbml0R2FtZShjdHgpIHtcbiAgdmFyIHVwZGF0ZUxlbmd0aCA9IDE7XG4gIHZhciB1cGRhdGVDb3VudCA9IDA7XG4gIHZhciBjb21tYW5kID0gJyc7XG4gIHZhciBzcGVlY2hCdXR0b25SYXRlID0gMTAwMDtcbiAgdmFyIG5leHRTcGVlY2hCdXR0b25QcmVzc1RpbWUgPSAwO1xuICB2YXIgaXNGYWlyeU5leHRUb0hvdXNlID0gZmFsc2U7XG4gIHZhciB0b2dnbGVSZWNvcmRTcGVlY2hDb21tYW5kQnV0dG9uO1xuICB2YXIgcGxheWVyO1xuICB2YXIgaG91c2VzO1xuICB2YXIgaG91c2U7XG4gIHZhciByaWdodEhvdXNlUG9zaXRpb24gPSA3MjA7XG4gIHZhciBsZWZ0SG91c2VQb3NpdGlvbiA9IDA7XG4gIHZhciBjdXJyZW50SG91c2VQb3NpdGlvbiA9IDE7XG4gIHZhciBleHBsb3Npb25zO1xuICB2YXIgY3Vyc29ycztcbiAgdmFyIGxldmVsID0gMTtcbiAgdmFyIGxldmVsU3RyaW5nO1xuICB2YXIgbGV2ZWxUZXh0O1xuXG4gIHZhciBMRUZUX0NPTU1BTkQgPSAnbGVmdCc7XG4gIHZhciBSSUdIVF9DT01NQU5EID0gJ3JpZ2h0JztcbiAgdmFyIERFU1RST1lfSE9VU0VfQ09NTUFORCA9ICdkZXN0cm95X2hvdXNlJztcblxuICBmdW5jdGlvbiBwYXJzZU1vdmVBY3Rpb25Db21tYW5kKHRleHQpIHtcbiAgICB2YXIgZGlyZWN0aW9uQ29tbWFuZHMgPSBbTEVGVF9DT01NQU5ELCBSSUdIVF9DT01NQU5EXTtcblxuICAgIHJldHVybiBkaXJlY3Rpb25Db21tYW5kcy5maW5kKGZ1bmN0aW9uKGRpcmVjdGlvbkNvbW1hbmQpIHtcbiAgICAgIHJldHVybiB0ZXh0LnRvTG93ZXJDYXNlKCkuc3BsaXQoJyAnKS5pbmRleE9mKGRpcmVjdGlvbkNvbW1hbmQpICE9PSAtMTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRGVzdHJveUFjdGlvbkNvbW1hbmQodGV4dCkge1xuICAgIGlmIChpc0ZhaXJ5TmV4dFRvSG91c2UgJiYgdGV4dC50b0xvd2VyQ2FzZSgpLnNwbGl0KCcgJykuaW5kZXhPZignaG91c2UnKSAhPT0gLTEpIHtcbiAgICAgIHJldHVybiBERVNUUk9ZX0hPVVNFX0NPTU1BTkQ7XG4gICAgfVxuICB9XG5cbiAgdmFyIHN1YmplY3QgPSAnbWVsdmluJztcblxuICB2YXIgcmVsYXRpb25BY3Rpb25zID0gW1xuICAgIHtcbiAgICAgIGFjdGlvbjogJ21vdmUnLFxuICAgICAgcGFyc2VHYW1lQ29tbWFuZDogcGFyc2VNb3ZlQWN0aW9uQ29tbWFuZFxuICAgIH0sXG4gICAge1xuICAgICAgYWN0aW9uOiAnZGVzdHJveScsXG4gICAgICBwYXJzZUdhbWVDb21tYW5kOiBwYXJzZURlc3Ryb3lBY3Rpb25Db21tYW5kXG4gICAgfVxuICBdO1xuXG4gIGdhbWUgPSBuZXcgUGhhc2VyLkdhbWUoNzUwLCAzMDAsIFBoYXNlci5BVVRPLCAnZXhhbXBsZS1nYW1lJywgeyBwcmVsb2FkOiBwcmVsb2FkLCBjcmVhdGU6IGNyZWF0ZSwgdXBkYXRlOiB1cGRhdGUsIHJlbmRlcjogcmVuZGVyIH0pO1xuXG4gIGZ1bmN0aW9uIHByZWxvYWQoKSB7XG4gICAgdmFyIGZhaXJ5RGF0YSA9IFtcbiAgICAgICAgJy4uLi5GLi4uLi4uLi4uLi5GLi4uJyxcbiAgICAgICAgJy4uLkYxRi4uLi4uLi4uLkYxRi4uJyxcbiAgICAgICAgJy4uRjExMUYuLi4uLi4uRjExMUYuLicsXG4gICAgICAgICcuRjExMTExRi4zMzMuRjExMTFGLi4nLFxuICAgICAgICAnLkYxMTExMTUzNDMzMzUxMTExMUYnLFxuICAgICAgICAnRjExMTExMzMyMzMzMzMzMTExMUYnLFxuICAgICAgICAnRjExMTEzMzMzMzMzMzMzMzExMUYnLFxuICAgICAgICAnRjExMTEzNzc3MzMzNzc3MzExMUYnLFxuICAgICAgICAnLkYxMTEzODU4Nzc3ODU4MzExRi4nLFxuICAgICAgICAnLkYxMTEzODU4ODg4ODU4MzExRi4uJyxcbiAgICAgICAgJy5GMTExMzc4ODg4ODg4NzMxRi4uJyxcbiAgICAgICAgJy4uRjExMTMzMzMzMzMzMzExRi4uJyxcbiAgICAgICAgJy4uLkZGLi4uLjY1NTU2Li4uLi4uJyxcbiAgICAgICAgJy4uLi4uLi42Ljc1Ny42Li4uLi4uJyxcbiAgICAgICAgJy4uLi4uLi41LjY2Ni41Li4uLi4uJyxcbiAgICAgICAgJy4uLi4uLi41Ljc3Ny41Li4uLi4uJyxcbiAgICAgICAgJy4uLi4uLi4uNi4uNy4uLi4uLi4uJyxcbiAgICAgICAgJy4uLi4uLi4uNy4uNy4uLi4uLi4uJ1xuICAgIF07XG5cbiAgICB2YXIgaG91c2VEYXRhID0gW1xuICAgICAgICAnLi4uLi42Li4uLi4nLFxuICAgICAgICAnLi4uLjY3Ni4uLi4nLFxuICAgICAgICAnLi4uNjc2NzYuLi4nLFxuICAgICAgICAnLi42NzY3Njc2Li4nLFxuICAgICAgICAnLjY3Njc2NzY3Ni4nLFxuICAgICAgICAnNjc2NzY3Njc2NzYnLFxuICAgICAgICAnNTVCQkI1NTU1NTUnLFxuICAgICAgICAnNTVCQkI1NUVFNTUnLFxuICAgICAgICAnNTUyQkI1NUVFNTUnLFxuICAgICAgICAnNTVCQkI1NTY2NTUnLFxuICAgICAgICAnNTVCQkI1NTU1NTUnLFxuICAgICAgICAnNTU1NTU1NTU1NTUnLFxuICAgICAgICAnNTU1NTU1NTU1NTUnXG4gICAgXTtcblxuICAgIGdhbWUuY3JlYXRlLnRleHR1cmUoJ2ZhaXJ5JywgZmFpcnlEYXRhLCAzLCAzLCAwKTtcbiAgICBnYW1lLmxvYWQuc3ByaXRlc2hlZXQoJ2thYm9vbScsICdpbWFnZXMvZXhwbG9kZS5wbmcnLCAxMjgsIDEyOCk7XG4gICAgaG91c2UgPSBnYW1lLmNyZWF0ZS50ZXh0dXJlKCdob3VzZScsIGhvdXNlRGF0YSwgMywgMywgMCk7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgZ2FtZS5waHlzaWNzLnN0YXJ0U3lzdGVtKFBoYXNlci5QaHlzaWNzLkFSQ0FERSk7XG5cbiAgICBwbGF5ZXIgPSBnYW1lLmFkZC5zcHJpdGUoMTAwLCAxMDAsICdmYWlyeScpO1xuXG4gICAgZ2FtZS5waHlzaWNzLmFyY2FkZS5lbmFibGUocGxheWVyKTtcblxuICAgIHBsYXllci5ib2R5LmNvbGxpZGVXb3JsZEJvdW5kcyA9IHRydWU7XG4gICAgcGxheWVyLmJvZHkuZ3Jhdml0eS55ID0gNTAwO1xuXG4gICAgaG91c2VzID0gZ2FtZS5hZGQucGh5c2ljc0dyb3VwKCk7XG4gICAgaG91c2UgPSBob3VzZXMuY3JlYXRlKHJpZ2h0SG91c2VQb3NpdGlvbiwgMjYwLCAnaG91c2UnKTtcblxuICAgIGV4cGxvc2lvbnMgPSBnYW1lLmFkZC5ncm91cCgpO1xuICAgIGV4cGxvc2lvbnMuY3JlYXRlTXVsdGlwbGUoMzAsICdrYWJvb20nKTtcblxuICAgIC8vICBUaGUgY3VycmVudCBsZXZlbFxuICAgIGxldmVsU3RyaW5nID0gJ0xldmVsIDogJztcbiAgICBsZXZlbFRleHQgPSBnYW1lLmFkZC50ZXh0KDEwLCAxMCwgbGV2ZWxTdHJpbmcgKyBsZXZlbCwgeyBmb250OiAnMzRweCBBcmlhbCcsIGZpbGw6ICcjZmZmJyB9KTtcblxuICAgIGhvdXNlcy5zZXRBbGwoJ2JvZHkuaW1tb3ZhYmxlJywgdHJ1ZSk7XG5cbiAgICBjdXJzb3JzID0gZ2FtZS5pbnB1dC5rZXlib2FyZC5jcmVhdGVDdXJzb3JLZXlzKCk7XG4gICAgdG9nZ2xlUmVjb3JkU3BlZWNoQ29tbWFuZEJ1dHRvbiA9IGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZC5TUEFDRUJBUik7XG4gICAgY3R4LnRvZ2dsZVJlY29yZFNwZWVjaENvbW1hbmQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZSgpIHtcbiAgICBnYW1lLnBoeXNpY3MuYXJjYWRlLmNvbGxpZGUocGxheWVyLCBob3VzZXMsIGNvbGxpc2lvbkhhbmRsZXIpO1xuXG4gICAgaWYgKHVwZGF0ZUNvdW50ID4gdXBkYXRlTGVuZ3RoKSB7XG4gICAgICBjb21tYW5kID0gJyc7XG4gICAgfVxuXG4gICAgaWYgKGN0eC5yZWxhdGlvbnMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGN0eC5yZWxhdGlvbnMpO1xuICAgICAgY29tbWFuZCA9IHBhcnNlUmVsYXRpb25zRm9yQ29tbWFuZChjdHgucmVsYXRpb25zKTtcbiAgICAgIHVwZGF0ZUNvdW50ID0gMDtcbiAgICAgIGN0eC5yZWxhdGlvbnMgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICh0b2dnbGVSZWNvcmRTcGVlY2hDb21tYW5kQnV0dG9uLmlzRG93bikge1xuICAgICAgaWYgKGdhbWUudGltZS50aW1lID49IG5leHRTcGVlY2hCdXR0b25QcmVzc1RpbWUpIHtcbiAgICAgICAgbmV4dFNwZWVjaEJ1dHRvblByZXNzVGltZSA9IGdhbWUudGltZS50aW1lICsgc3BlZWNoQnV0dG9uUmF0ZTtcbiAgICAgICAgY29uc29sZS5sb2coJ3RvZ2dsaW5nIHJlY29yZGluZycpO1xuICAgICAgICBjdHgudG9nZ2xlUmVjb3JkU3BlZWNoQ29tbWFuZCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHN3aXRjaCAoY29tbWFuZCkge1xuICAgICAgY2FzZSBMRUZUX0NPTU1BTkQ6XG4gICAgICAgIHVwZGF0ZUNvdW50Kys7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAtMjUwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUklHSFRfQ09NTUFORDpcbiAgICAgICAgdXBkYXRlQ291bnQrKztcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCA9IDI1MDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIERFU1RST1lfSE9VU0VfQ09NTUFORDpcbiAgICAgICAgaG91c2Uua2lsbCgpO1xuICAgICAgICBpc0ZhaXJ5TmV4dFRvSG91c2UgPSBmYWxzZTtcbiAgICAgICAgdmFyIGV4cGxvc2lvbiA9IGV4cGxvc2lvbnMuZ2V0Rmlyc3RFeGlzdHMoZmFsc2UsIGZhbHNlLCBob3VzZS5ib2R5LngsIGhvdXNlLmJvZHkueSk7XG4gICAgICAgIGV4cGxvc2lvbi5wbGF5KCdrYWJvb20nLCAzMCwgZmFsc2UsIHRydWUpO1xuICAgICAgICBsZXZlbCsrO1xuICAgICAgICBsZXZlbFRleHQudGV4dCA9IGxldmVsU3RyaW5nICsgbGV2ZWw7XG4gICAgICAgIGNvbW1hbmQgPSAnJztcblxuICAgICAgICBpZiAoY3VycmVudEhvdXNlUG9zaXRpb24gPT0gMSkge1xuICAgICAgICAgIGN1cnJlbnRIb3VzZVBvc2l0aW9uID0gMjtcbiAgICAgICAgICBob3VzZSA9IGhvdXNlcy5jcmVhdGUobGVmdEhvdXNlUG9zaXRpb24sIDI2MCwgJ2hvdXNlJyk7XG4gICAgICAgICAgaG91c2VzLnNldEFsbCgnYm9keS5pbW1vdmFibGUnLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjdXJyZW50SG91c2VQb3NpdGlvbiA9IDE7XG4gICAgICAgICAgaG91c2UgPSBob3VzZXMuY3JlYXRlKHJpZ2h0SG91c2VQb3NpdGlvbiwgMjYwLCAnaG91c2UnKTtcbiAgICAgICAgICBob3VzZXMuc2V0QWxsKCdib2R5LmltbW92YWJsZScsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyKCkge1xuXG4gIH1cblxuICBmdW5jdGlvbiBjb2xsaXNpb25IYW5kbGVyKCkge1xuICAgIGlzRmFpcnlOZXh0VG9Ib3VzZSA9IHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVJlbGF0aW9uc0ZvckNvbW1hbmQocmVsYXRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgIHZhciByZWxhdGlvbldpdGhTdWJqZWN0ID0gcmVsYXRpb25zLmZpbmQoZnVuY3Rpb24ocmVsYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHJlbGF0aW9uLnN1YmplY3QudGV4dC50b0xvd2VyQ2FzZSgpID09PSBzdWJqZWN0O1xuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVsYXRpb25XaXRoU3ViamVjdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciByZWxhdGlvbkFjdGlvbiA9IHJlbGF0aW9uQWN0aW9ucy5maW5kKGZ1bmN0aW9uKHJlbGF0aW9uQWN0aW9uKSB7XG4gICAgICAgIHJldHVybiByZWxhdGlvbkFjdGlvbi5hY3Rpb24gPT09IHJlbGF0aW9uV2l0aFN1YmplY3QuYWN0aW9uLmxlbW1hdGl6ZWQudG9Mb3dlckNhc2UoKTtcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoISFyZWxhdGlvbkFjdGlvbikge1xuICAgICAgICByZXR1cm4gcmVsYXRpb25BY3Rpb24ucGFyc2VHYW1lQ29tbWFuZChyZWxhdGlvbldpdGhTdWJqZWN0Lm9iamVjdC50ZXh0KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmxvZygnQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcGFyc2luZyBzcGVlY2ggY29tbWFuZHMnLCBlKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ2FtZTtcbn1cblxuZXhwb3J0cy5pbml0R2FtZSA9IGluaXRHYW1lO1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBpbml0U2Vzc2lvblBlcm1pc3Npb25zID0gcmVxdWlyZSgnLi9zZXNzaW9ucGVybWlzc2lvbnMnKS5pbml0U2Vzc2lvblBlcm1pc3Npb25zO1xudmFyIGluaXRBbmltYXRlUGFuZWwgPSByZXF1aXJlKCcuL2FuaW1hdGVwYW5lbCcpLmluaXRBbmltYXRlUGFuZWw7XG52YXIgaW5pdFNob3dUYWIgPSByZXF1aXJlKCcuL3Nob3d0YWInKS5pbml0U2hvd1RhYjtcbnZhciBpbml0RHJhZ0Ryb3AgPSByZXF1aXJlKCcuL2RyYWdkcm9wJykuaW5pdERyYWdEcm9wO1xudmFyIGluaXRQbGF5U2FtcGxlID0gcmVxdWlyZSgnLi9wbGF5c2FtcGxlJykuaW5pdFBsYXlTYW1wbGU7XG52YXIgaW5pdFJlY29yZEJ1dHRvbiA9IHJlcXVpcmUoJy4vcmVjb3JkYnV0dG9uJykuaW5pdFJlY29yZEJ1dHRvbjtcbnZhciBpbml0RmlsZVVwbG9hZCA9IHJlcXVpcmUoJy4vZmlsZXVwbG9hZCcpLmluaXRGaWxlVXBsb2FkO1xudmFyIGluaXREaXNwbGF5TWV0YWRhdGEgPSByZXF1aXJlKCcuL2Rpc3BsYXltZXRhZGF0YScpLmluaXREaXNwbGF5TWV0YWRhdGE7XG52YXIgaW5pdEdhbWUgPSByZXF1aXJlKCcuL2dhbWUnKS5pbml0R2FtZTtcblxuZXhwb3J0cy5pbml0Vmlld3MgPSBmdW5jdGlvbihjdHgpIHtcbiAgY29uc29sZS5sb2coJ0luaXRpYWxpemluZyB2aWV3cy4uLicpO1xuICBpbml0UGxheVNhbXBsZShjdHgpO1xuICBpbml0RHJhZ0Ryb3AoY3R4KTtcbiAgaW5pdFJlY29yZEJ1dHRvbihjdHgpO1xuICBpbml0RmlsZVVwbG9hZChjdHgpO1xuICBpbml0U2Vzc2lvblBlcm1pc3Npb25zKCk7XG4gIGluaXRTaG93VGFiKCk7XG4gIGluaXRBbmltYXRlUGFuZWwoKTtcbiAgaW5pdFNob3dUYWIoKTtcbiAgaW5pdERpc3BsYXlNZXRhZGF0YSgpO1xuICBpbml0R2FtZShjdHgpO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTQgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLyogZ2xvYmFsICQgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbnZhciBvbkZpbGVQcm9ncmVzcyA9IHV0aWxzLm9uRmlsZVByb2dyZXNzO1xudmFyIGhhbmRsZUZpbGVVcGxvYWQgPSByZXF1aXJlKCcuLi9oYW5kbGVmaWxldXBsb2FkJykuaGFuZGxlRmlsZVVwbG9hZDtcbnZhciBzaG93RXJyb3IgPSByZXF1aXJlKCcuL3Nob3dlcnJvcicpLnNob3dFcnJvcjtcbnZhciBlZmZlY3RzID0gcmVxdWlyZSgnLi9lZmZlY3RzJyk7XG5cblxudmFyIExPT0tVUF9UQUJMRSA9IHtcbiAgJ2VuLVVTX0Jyb2FkYmFuZE1vZGVsJzogWydVc19FbmdsaXNoX0Jyb2FkYmFuZF9TYW1wbGVfMS53YXYnLCAnVXNfRW5nbGlzaF9Ccm9hZGJhbmRfU2FtcGxlXzIud2F2J10sXG4gICdlbi1VU19OYXJyb3diYW5kTW9kZWwnOiBbJ1VzX0VuZ2xpc2hfTmFycm93YmFuZF9TYW1wbGVfMS53YXYnLCAnVXNfRW5nbGlzaF9OYXJyb3diYW5kX1NhbXBsZV8yLndhdiddLFxuICAnZXMtRVNfQnJvYWRiYW5kTW9kZWwnOiBbJ0VzX0VTX3NwazI0XzE2a2h6LndhdicsICdFc19FU19zcGsxOV8xNmtoei53YXYnXSxcbiAgJ2VzLUVTX05hcnJvd2JhbmRNb2RlbCc6IFsnRXNfRVNfc3BrMjRfOGtoei53YXYnLCAnRXNfRVNfc3BrMTlfOGtoei53YXYnXSxcbiAgJ3B0LUJSX0Jyb2FkYmFuZE1vZGVsJzogWydwdC1CUl9TYW1wbGUxLTE2S0h6LndhdicsICdwdC1CUl9TYW1wbGUyLTE2S0h6LndhdiddLFxuICAncHQtQlJfTmFycm93YmFuZE1vZGVsJzogWydwdC1CUl9TYW1wbGUxLThLSHoud2F2JywgJ3B0LUJSX1NhbXBsZTItOEtIei53YXYnXSxcbiAgJ3poLUNOX0Jyb2FkYmFuZE1vZGVsJzogWyd6aC1DTl9zYW1wbGUxX2Zvcl8xNmsud2F2JywgJ3poLUNOX3NhbXBsZTJfZm9yXzE2ay53YXYnXSxcbiAgJ3poLUNOX05hcnJvd2JhbmRNb2RlbCc6IFsnemgtQ05fc2FtcGxlMV9mb3JfOGsud2F2JywgJ3poLUNOX3NhbXBsZTJfZm9yXzhrLndhdiddXG59O1xuXG52YXIgcGxheVNhbXBsZSA9IChmdW5jdGlvbigpIHtcblxuICB2YXIgcnVubmluZyA9IGZhbHNlO1xuICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsICdmYWxzZScpO1xuICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc2FtcGxlUGxheWluZycsICdmYWxzZScpO1xuXG4gIHJldHVybiBmdW5jdGlvbih0b2tlbiwgaW1hZ2VUYWcsIHNhbXBsZU51bWJlciwgaWNvbk5hbWUsIHVybCkge1xuXG4gICAgJC5wdWJsaXNoKCdjbGVhcnNjcmVlbicpO1xuXG4gICAgdmFyIGN1cnJlbnRseURpc3BsYXlpbmcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycpO1xuICAgIHZhciBzYW1wbGVQbGF5aW5nID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3NhbXBsZVBsYXlpbmcnKTtcblxuICAgIGlmIChzYW1wbGVQbGF5aW5nID09PSBzYW1wbGVOdW1iZXIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdIQVJEIFNPQ0tFVCBTVE9QJyk7XG4gICAgICAkLnB1Ymxpc2goJ3NvY2tldHN0b3AnKTtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgJ2ZhbHNlJyk7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc2FtcGxlUGxheWluZycsICdmYWxzZScpO1xuICAgICAgZWZmZWN0cy5zdG9wVG9nZ2xlSW1hZ2UodGltZXIsIGltYWdlVGFnLCBpY29uTmFtZSk7XG4gICAgICBlZmZlY3RzLnJlc3RvcmVJbWFnZShpbWFnZVRhZywgaWNvbk5hbWUpO1xuICAgICAgcnVubmluZyA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50bHlEaXNwbGF5aW5nID09PSAncmVjb3JkJykge1xuICAgICAgc2hvd0Vycm9yKCdDdXJyZW50bHkgYXVkaW8gaXMgYmVpbmcgcmVjb3JkZWQsIHBsZWFzZSBzdG9wIHJlY29yZGluZyBiZWZvcmUgcGxheWluZyBhIHNhbXBsZScpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoY3VycmVudGx5RGlzcGxheWluZyA9PT0gJ2ZpbGV1cGxvYWQnIHx8IHNhbXBsZVBsYXlpbmcgIT09ICdmYWxzZScpIHtcbiAgICAgIHNob3dFcnJvcignQ3VycmVudGx5IGFub3RoZXIgZmlsZSBpcyBwbGF5aW5nLCBwbGVhc2Ugc3RvcCB0aGUgZmlsZSBvciB3YWl0IHVudGlsIGl0IGZpbmlzaGVzJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCAnc2FtcGxlJyk7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3NhbXBsZVBsYXlpbmcnLCBzYW1wbGVOdW1iZXIpO1xuICAgIHJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgJCgnI3Jlc3VsdHNUZXh0JykudmFsKCcnKTsgICAvLyBjbGVhciBoeXBvdGhlc2VzIGZyb20gcHJldmlvdXMgcnVuc1xuXG4gICAgdmFyIHRpbWVyID0gc2V0SW50ZXJ2YWwoZWZmZWN0cy50b2dnbGVJbWFnZSwgNzUwLCBpbWFnZVRhZywgaWNvbk5hbWUpO1xuXG4gICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpO1xuICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYmxvYic7XG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGJsb2IgPSB4aHIucmVzcG9uc2U7XG4gICAgICB2YXIgY3VycmVudE1vZGVsID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpIHx8ICdlbi1VU19Ccm9hZGJhbmRNb2RlbCc7XG4gICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgIHZhciBibG9iVG9UZXh0ID0gbmV3IEJsb2IoW2Jsb2JdKS5zbGljZSgwLCA0KTtcbiAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGJsb2JUb1RleHQpO1xuICAgICAgcmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY29udGVudFR5cGUgPSByZWFkZXIucmVzdWx0ID09PSAnZkxhQycgPyAnYXVkaW8vZmxhYycgOiAnYXVkaW8vd2F2JztcbiAgICAgICAgY29uc29sZS5sb2coJ1VwbG9hZGluZyBmaWxlJywgcmVhZGVyLnJlc3VsdCk7XG4gICAgICAgIHZhciBtZWRpYVNvdXJjZVVSTCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuICAgICAgICBhdWRpby5zcmMgPSBtZWRpYVNvdXJjZVVSTDtcbiAgICAgICAgYXVkaW8ucGxheSgpO1xuICAgICAgICAkLnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgfSk7XG4gICAgICAgICQuc3Vic2NyaWJlKCdzb2NrZXRzdG9wJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgYXVkaW8ucGF1c2UoKTtcbiAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgIH0pO1xuICAgICAgICBoYW5kbGVGaWxlVXBsb2FkKCdzYW1wbGUnLCB0b2tlbiwgY3VycmVudE1vZGVsLCBibG9iLCBjb250ZW50VHlwZSwgZnVuY3Rpb24oc29ja2V0KSB7XG4gICAgICAgICAgdmFyIHBhcnNlT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGZpbGU6IGJsb2JcbiAgICAgICAgICB9O1xuICAgICAgICAgIHZhciBzYW1wbGluZ1JhdGUgPSAoY3VycmVudE1vZGVsLmluZGV4T2YoJ0Jyb2FkYmFuZCcpICE9PSAtMSkgPyAxNjAwMCA6IDgwMDA7XG4gICAgICAgICAgb25GaWxlUHJvZ3Jlc3MocGFyc2VPcHRpb25zLFxuICAgICAgICAgICAgLy8gT24gZGF0YSBjaHVua1xuICAgICAgICAgICAgZnVuY3Rpb24gb25EYXRhKGNodW5rKSB7XG4gICAgICAgICAgICAgIHNvY2tldC5zZW5kKGNodW5rKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiBpc1J1bm5pbmcoKSB7XG4gICAgICAgICAgICAgIGlmKHJ1bm5pbmcpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLy8gT24gZmlsZSByZWFkIGVycm9yXG4gICAgICAgICAgICBmdW5jdGlvbihldnQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0Vycm9yIHJlYWRpbmcgZmlsZTogJywgZXZ0Lm1lc3NhZ2UpO1xuICAgICAgICAgICAgICAvLyBzaG93RXJyb3IoZXZ0Lm1lc3NhZ2UpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIE9uIGxvYWQgZW5kXG4gICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgc29ja2V0LnNlbmQoSlNPTi5zdHJpbmdpZnkoeydhY3Rpb24nOiAnc3RvcCd9KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2FtcGxpbmdSYXRlXG4gICAgICAgICAgICApO1xuICAgICAgICB9LFxuICAgICAgICAvLyBPbiBjb25uZWN0aW9uIGVuZFxuICAgICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZWZmZWN0cy5zdG9wVG9nZ2xlSW1hZ2UodGltZXIsIGltYWdlVGFnLCBpY29uTmFtZSk7XG4gICAgICAgICAgICBlZmZlY3RzLnJlc3RvcmVJbWFnZShpbWFnZVRhZywgaWNvbk5hbWUpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCAnZmFsc2UnKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdzYW1wbGVQbGF5aW5nJywgJ2ZhbHNlJyk7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgfTtcbiAgICB9O1xuICAgIHhoci5zZW5kKCk7XG4gIH07XG59KSgpO1xuXG5cbmV4cG9ydHMuaW5pdFBsYXlTYW1wbGUgPSBmdW5jdGlvbihjdHgpIHtcblxuICAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZpbGVOYW1lID0gJ2F1ZGlvLycgKyBMT09LVVBfVEFCTEVbY3R4LmN1cnJlbnRNb2RlbF1bMF07XG4gICAgdmFyIGVsID0gJCgnLnBsYXktc2FtcGxlLTEnKTtcbiAgICBlbC5vZmYoJ2NsaWNrJyk7XG4gICAgdmFyIGljb25OYW1lID0gJ3BsYXknO1xuICAgIHZhciBpbWFnZVRhZyA9IGVsLmZpbmQoJ2ltZycpO1xuICAgIGVsLmNsaWNrKCBmdW5jdGlvbigpIHtcbiAgICAgIHBsYXlTYW1wbGUoY3R4LnRva2VuLCBpbWFnZVRhZywgJ3NhbXBsZS0xJywgaWNvbk5hbWUsIGZpbGVOYW1lLCBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1BsYXkgc2FtcGxlIHJlc3VsdCcsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSkoY3R4LCBMT09LVVBfVEFCTEUpO1xuXG4gIChmdW5jdGlvbigpIHtcbiAgICB2YXIgZmlsZU5hbWUgPSAnYXVkaW8vJyArIExPT0tVUF9UQUJMRVtjdHguY3VycmVudE1vZGVsXVsxXTtcbiAgICB2YXIgZWwgPSAkKCcucGxheS1zYW1wbGUtMicpO1xuICAgIGVsLm9mZignY2xpY2snKTtcbiAgICB2YXIgaWNvbk5hbWUgPSAncGxheSc7XG4gICAgdmFyIGltYWdlVGFnID0gZWwuZmluZCgnaW1nJyk7XG4gICAgZWwuY2xpY2soIGZ1bmN0aW9uKCkge1xuICAgICAgcGxheVNhbXBsZShjdHgudG9rZW4sIGltYWdlVGFnLCAnc2FtcGxlLTInLCBpY29uTmFtZSwgZmlsZU5hbWUsIGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgICBjb25zb2xlLmxvZygnUGxheSBzYW1wbGUgcmVzdWx0JywgcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KShjdHgsIExPT0tVUF9UQUJMRSk7XG5cbn07IiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vKiBnbG9iYWwgJCAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWljcm9waG9uZSA9IHJlcXVpcmUoJy4uL01pY3JvcGhvbmUnKTtcbnZhciBoYW5kbGVNaWNyb3Bob25lID0gcmVxdWlyZSgnLi4vaGFuZGxlbWljcm9waG9uZScpLmhhbmRsZU1pY3JvcGhvbmU7XG52YXIgc2hvd0Vycm9yID0gcmVxdWlyZSgnLi9zaG93ZXJyb3InKS5zaG93RXJyb3I7XG5cbmV4cG9ydHMuaW5pdFJlY29yZEJ1dHRvbiA9IGZ1bmN0aW9uKGN0eCkge1xuICB2YXIgcnVubmluZyA9IGZhbHNlO1xuICB2YXIgbWljT3B0aW9ucyA9IHtcbiAgICBidWZmZXJTaXplOiBjdHguYnVmZmVyc2l6ZVxuICB9O1xuICB2YXIgbWljID0gbmV3IE1pY3JvcGhvbmUobWljT3B0aW9ucyk7XG5cbiAgY3R4LnRvZ2dsZVJlY29yZFNwZWVjaENvbW1hbmQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY3VycmVudE1vZGVsID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpO1xuXG4gICAgaWYgKCFydW5uaW5nKSB7XG4gICAgICAkKCcjcmVzdWx0c1RleHQnKS52YWwoJycpOyAgIC8vIGNsZWFyIGh5cG90aGVzZXMgZnJvbSBwcmV2aW91cyBydW5zXG4gICAgICBjb25zb2xlLmxvZygnTm90IHJ1bm5pbmcsIGhhbmRsZU1pY3JvcGhvbmUoKScpO1xuICAgICAgaGFuZGxlTWljcm9waG9uZShjdHgudG9rZW4sIGN1cnJlbnRNb2RlbCwgbWljLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHZhciBtc2cgPSAnRXJyb3I6ICcgKyBlcnIubWVzc2FnZTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhtc2cpO1xuICAgICAgICAgIHNob3dFcnJvcihtc2cpO1xuICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnc3RhcnRpbmcgbWljJyk7XG4gICAgICAgICAgbWljLnJlY29yZCgpO1xuICAgICAgICAgIHJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ1N0b3BwaW5nIG1pY3JvcGhvbmUsIHNlbmRpbmcgc3RvcCBhY3Rpb24gbWVzc2FnZScpO1xuICAgICAgJC5wdWJsaXNoKCdoYXJkc29ja2V0c3RvcCcpO1xuICAgICAgbWljLnN0b3AoKTtcbiAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcblxuICAgICAgY3R4LmFsY2hlbXlQcm94eS5nZXRBbGNoZW15UmVsYXRpb25zKFxuICAgICAgICAkKCcjcmVzdWx0c1RleHQnKS52YWwoKSxcbiAgICAgICAgZnVuY3Rpb24oZXJyLCByZXNwb25zZSkge1xuICAgICAgICAgIGlmICghZXJyKSB7XG4gICAgICAgICAgICBjdHgucmVsYXRpb25zID0gcmVzcG9uc2UucmVsYXRpb25zO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9XG4gIH07XG59O1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vKiBnbG9iYWwgJCAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaW5pdFBsYXlTYW1wbGUgPSByZXF1aXJlKCcuL3BsYXlzYW1wbGUnKS5pbml0UGxheVNhbXBsZTtcblxuZXhwb3J0cy5pbml0U2VsZWN0TW9kZWwgPSBmdW5jdGlvbihjdHgpIHtcblxuXG4gIGN0eC5tb2RlbHMuZm9yRWFjaChmdW5jdGlvbihtb2RlbCkge1xuICAgIGlmKG1vZGVsLm5hbWUuaW5kZXhPZignSlAnKT4tMSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgICQoJyNkcm9wZG93bk1lbnVMaXN0JykuYXBwZW5kKFxuICAgICAgJCgnPGxpPicpXG4gICAgICAgIC5hdHRyKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpXG4gICAgICAgIC5hcHBlbmQoXG4gICAgICAgICAgJCgnPGE+JykuYXR0cigncm9sZScsICdtZW51LWl0ZW0nKVxuICAgICAgICAgICAgLmF0dHIoJ2hyZWYnLCAnLycpXG4gICAgICAgICAgICAuYXR0cignZGF0YS1tb2RlbCcsIG1vZGVsLm5hbWUpXG4gICAgICAgICAgICAuYXBwZW5kKG1vZGVsLmRlc2NyaXB0aW9uLnN1YnN0cmluZygwLCBtb2RlbC5kZXNjcmlwdGlvbi5sZW5ndGggLSAxKSwgbW9kZWwucmF0ZT09ODAwMD8nICg4S0h6KSc6JyAoMTZLSHopJykpXG4gICAgICAgICAgKVxuICB9KTtcblxuXG4gICQoJyNkcm9wZG93bk1lbnVMaXN0JykuY2xpY2soZnVuY3Rpb24oZXZ0KSB7XG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZ0LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnNvbGUubG9nKCdDaGFuZ2UgdmlldycsICQoZXZ0LnRhcmdldCkudGV4dCgpKTtcbiAgICB2YXIgbmV3TW9kZWxEZXNjcmlwdGlvbiA9ICQoZXZ0LnRhcmdldCkudGV4dCgpO1xuICAgIHZhciBuZXdNb2RlbCA9ICQoZXZ0LnRhcmdldCkuZGF0YSgnbW9kZWwnKTtcbiAgICAkKCcjZHJvcGRvd25NZW51RGVmYXVsdCcpLmVtcHR5KCkudGV4dChuZXdNb2RlbERlc2NyaXB0aW9uKTtcbiAgICAkKCcjZHJvcGRvd25NZW51MScpLmRyb3Bkb3duKCd0b2dnbGUnKTtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudE1vZGVsJywgbmV3TW9kZWwpO1xuICAgIGN0eC5jdXJyZW50TW9kZWwgPSBuZXdNb2RlbDtcbiAgICBpbml0UGxheVNhbXBsZShjdHgpO1xuICAgICQucHVibGlzaCgnY2xlYXJzY3JlZW4nKTtcbiAgfSk7XG5cbn07XG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE0IElCTSBDb3JwLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cbi8qIGdsb2JhbCAkICovXG4ndXNlIHN0cmljdCc7XG5cblxuZXhwb3J0cy5pbml0U2Vzc2lvblBlcm1pc3Npb25zID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCdJbml0aWFsaXppbmcgc2Vzc2lvbiBwZXJtaXNzaW9ucyBoYW5kbGVyJyk7XG4gIC8vIFJhZGlvIGJ1dHRvbnNcbiAgdmFyIHNlc3Npb25QZXJtaXNzaW9uc1JhZGlvID0gJChcIiNzZXNzaW9uUGVybWlzc2lvbnNSYWRpb0dyb3VwIGlucHV0W3R5cGU9J3JhZGlvJ11cIik7XG4gIHNlc3Npb25QZXJtaXNzaW9uc1JhZGlvLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgIHZhciBjaGVja2VkVmFsdWUgPSBzZXNzaW9uUGVybWlzc2lvbnNSYWRpby5maWx0ZXIoJzpjaGVja2VkJykudmFsKCk7XG4gICAgY29uc29sZS5sb2coJ2NoZWNrZWRWYWx1ZScsIGNoZWNrZWRWYWx1ZSk7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3Nlc3Npb25QZXJtaXNzaW9ucycsIGNoZWNrZWRWYWx1ZSk7XG4gIH0pO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTQgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLyogZ2xvYmFsICQgKi9cbid1c2Ugc3RyaWN0JztcblxuXG5leHBvcnRzLnNob3dFcnJvciA9IGZ1bmN0aW9uKG1zZykge1xuICBjb25zb2xlLmxvZygnRXJyb3I6ICcsIG1zZyk7XG4gIHZhciBlcnJvckFsZXJ0ID0gJCgnLmVycm9yLXJvdycpO1xuICBlcnJvckFsZXJ0LmhpZGUoKTtcbiAgZXJyb3JBbGVydC5jc3MoJ2JhY2tncm91bmQtY29sb3InLCAnI2Q3NDEwOCcpO1xuICBlcnJvckFsZXJ0LmNzcygnY29sb3InLCAnd2hpdGUnKTtcbiAgdmFyIGVycm9yTWVzc2FnZSA9ICQoJyNlcnJvck1lc3NhZ2UnKTtcbiAgZXJyb3JNZXNzYWdlLnRleHQobXNnKTtcbiAgZXJyb3JBbGVydC5zaG93KCk7XG4gICQoJyNlcnJvckNsb3NlJykuY2xpY2soZnVuY3Rpb24oZSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlcnJvckFsZXJ0LmhpZGUoKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0pO1xufTtcblxuZXhwb3J0cy5zaG93Tm90aWNlID0gZnVuY3Rpb24obXNnKSB7XG4gIGNvbnNvbGUubG9nKCdOb3RpY2U6ICcsIG1zZyk7XG4gIHZhciBub3RpY2VBbGVydCA9ICQoJy5ub3RpZmljYXRpb24tcm93Jyk7XG4gIG5vdGljZUFsZXJ0LmhpZGUoKTtcbiAgbm90aWNlQWxlcnQuY3NzKCdib3JkZXInLCAnMnB4IHNvbGlkICNlY2VjZWMnKTtcbiAgbm90aWNlQWxlcnQuY3NzKCdiYWNrZ3JvdW5kLWNvbG9yJywgJyNmNGY0ZjQnKTtcbiAgbm90aWNlQWxlcnQuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICB2YXIgbm90aWNlTWVzc2FnZSA9ICQoJyNub3RpZmljYXRpb25NZXNzYWdlJyk7XG4gIG5vdGljZU1lc3NhZ2UudGV4dChtc2cpO1xuICBub3RpY2VBbGVydC5zaG93KCk7XG4gICQoJyNub3RpZmljYXRpb25DbG9zZScpLmNsaWNrKGZ1bmN0aW9uKGUpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgbm90aWNlQWxlcnQuaGlkZSgpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLmhpZGVFcnJvciA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZXJyb3JBbGVydCA9ICQoJy5lcnJvci1yb3cnKTtcbiAgZXJyb3JBbGVydC5oaWRlKCk7XG59O1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vKiBnbG9iYWwgJCAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmluaXRTaG93VGFiID0gZnVuY3Rpb24oKSB7XG4gICQoJy5uYXYtdGFicyBhW2RhdGEtdG9nZ2xlPVwidGFiXCJdJykub24oJ3Nob3duLmJzLnRhYicsIGZ1bmN0aW9uIChlKSB7XG4gICAgLy9zaG93IHNlbGVjdGVkIHRhYiAvIGFjdGl2ZVxuICAgIHZhciB0YXJnZXQgPSAkKGUudGFyZ2V0KS50ZXh0KCk7XG4gICAgaWYgKHRhcmdldCA9PT0gJ0pTT04nKSB7XG4gICAgICAkLnB1Ymxpc2goJ3Nob3dqc29uJyk7XG4gICAgfVxuICB9KTtcbn07XG4iXX0=
