/*globals fdom:true */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */
if (typeof fdom === 'undefined') {
  fdom = {};
}
fdom.port = fdom.port || {};

/**
 * A port providing message transport between two freedom contexts via iFrames.
 * @class Frame
 * @extends Port
 * @uses handleEvents
 * @constructor
 */
fdom.port.Frame = function() {
  this.id = 'Frame ' + Math.random();
  this.config = {};
  this.src = null;

  fdom.util.handleEvents(this);
};

/**
 * Start this port by listening or creating a frame.
 * @method start
 * @private
 */
fdom.port.Frame.prototype.start = function() {
  if (this.config.appContext) {
    this.setupListener();
    this.src = 'in';
  } else {
    this.setupFrame();
    this.src = 'out';
  }
};

/**
 * Stop this port by deleting the frame.
 * @method stop
 * @private
 */
fdom.port.Frame.prototype.stop = function() {
  // Function is determined by setupListener or setupFrame as appropriate.
};

/**
 * Get the textual description of this port.
 * @method toString
 * @return {String} the description of this port.
 */
fdom.port.Frame.prototype.toString = function() {
  return "[" + this.id + "]";
};

/**
 * Set up a global listener to handle incoming messages to this
 * freedom.js context.
 * @method setupListener
 */
fdom.port.Frame.prototype.setupListener = function() {
  var onMsg = function(msg) {
    if (msg.data.src !== 'in') {
      this.emitMessage(msg.data.flow, msg.data.message);
    }
  }.bind(this);
  this.obj = this.config.global;
  this.obj.addEventListener('message', onMsg, true);
  this.stop = function() {
    this.obj.removeEventListener('message', onMsg, true);
    delete this.obj;
  };
  this.emit('started');
};

/**
 * Emit messages to the the hub, mapping control channels.
 * @method emitMessage
 * @param {String} flow the flow to emit the message on.
 * @param {Object} messgae The message to emit.
 */
fdom.port.Frame.prototype.emitMessage = function(flow, message) {
  if (flow === 'control' && this.controlChannel) {
    flow = this.controlChannel;
  }
  this.emit(flow, message);
};

/**
 * Set up an iFrame with an isolated freedom.js context inside.
 * @method setupFrame
 */
fdom.port.Frame.prototype.setupFrame = function() {
  var frame, onMsg;
  frame = this.makeFrame(this.config.src, this.config.inject);  
  
  if (!document.body) {
    document.appendChild(document.createElement("body"));
  }
  document.body.appendChild(frame);

  onMsg = function(frame, msg) {
    if (!this.obj) {
      this.obj = frame;
      this.emit('started');
    }
    if (msg.data.src !== 'out') {
      this.emitMessage(msg.data.flow, msg.data.message);
    }
  }.bind(this, frame.contentWindow);

  frame.contentWindow.addEventListener('message', onMsg, true);
  this.stop = function() {
    frame.contentWindow.removeEventListener('message', onMsg, true);
    if (this.obj) {
      delete this.obj;
    }
    frame.src = "about:blank";
    document.body.removeChild(frame);
  };
};

/**
 * Make frames to replicate freedom isolation without web-workers.
 * iFrame isolation is non-standardized, and access to the DOM within frames
 * means that they are insecure. However, debugging of webworkers is
 * painful enough that this mode of execution can be valuable for debugging.
 * @method makeFrame
 */
fdom.port.Frame.prototype.makeFrame = function(src, inject) {
  var frame = document.createElement('iframe'),
      extra = '',
      loader,
      blob;
  // TODO(willscott): add sandboxing protection.

  // TODO(willscott): survive name mangling.
  src = src.replace("'portType': 'Worker'", "'portType': 'Frame'");
  if (inject) {
    extra = '<script src="' + inject + '" onerror="' +
      'throw new Error(\'Injection of ' + inject +' Failed!\');' +
      '"></script>';
  }
  loader = '<html>' + extra + '<script src="' +
      fdom.util.forceAppContext(src) + '"></script></html>';
  blob = fdom.util.getBlob(loader, 'text/html');
  frame.src = fdom.util.getURL(blob);

  return frame;
};

/**
 * Receive messages from the hub to this port.
 * Received messages will be emitted from the other side of the port.
 * @method onMessage
 * @param {String} flow the channel/flow of the message.
 * @param {Object} message The Message.
 */
fdom.port.Frame.prototype.onMessage = function(flow, message) {
  if (flow === 'control' && !this.controlChannel) {
    if (!this.controlChannel && message.channel) {
      this.controlChannel = message.channel;
      fdom.util.mixin(this.config, message.config);
      this.start();
    }
  } else {
    if (this.obj) {
      //fdom.debug.log('message sent to worker: ', flow, message);
      this.obj.postMessage({
        src: this.src,
        flow: flow,
        message: message
      }, '*');
    } else {
      this.once('started', this.onMessage.bind(this, flow, message));
    }
  }
};

