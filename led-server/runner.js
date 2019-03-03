const Jimp = require('jimp');

const LedNode = require('./common/modules/LedNode');

const modeEnum = require('./common/modeEnum');
const utils = require('./common/utils');
const ledManager = require('./common/ledManager');

const config = require('./config');
const logicer = require('./scripts/logicer');
const networkMrg = require('./networkManager');

const runtimeValue = require('./runtimeValue');

const INTERVAL = config.RunnerInterval || 100;
/** @type {LedNode[]} */
const NODES = config.Nodes;

let _intervalId = null;
let _locked = false;
let _currentTask = null;
let _lastLedStatus = null;
let _lastButtonStatus = null;

let _art = {
    index: 0,
    length: 0,
    data: [],
};

class Runner {
    constructor() {
        this.lastUpdateTime = Date.now();
    }

    loop() {
        if (_currentTask == null) {
            // console.warn('No task now.');
            this.lastUpdateTime = Date.now();
            return;
        }

        if (_locked) {
            return;
        }

        _locked = true;
        let elapsed = Date.now() - this.lastUpdateTime;
        _currentTask(elapsed);
        this.lastUpdateTime = Date.now();
        _locked = false;

        // fix the led to reset
        if (_intervalId == null) {
            this.sendResetToNode();
        }
    }

    runFreeMode(elapsed) {
        // console.log('Free mode running...');
        // do nothing...
    }

    runArtMode(elapsed) {
        // console.log('Art mode running...');

        /** @type {Array<Array<string>>} */
        let currentData = _art.data[_art.index];
        NODES.forEach(node => {
            try {
                ledManager.setRawLedStatus(currentData);
                networkMrg.ledStatus(node.Host, currentData);
            } catch (error) {
                console.error(error);
            }
        });

        _art.index = ++_art.index % _art.length;
    }

    runBlockyMode(elapsed) {
        // console.log('Blockly mode running...');

        runtimeValue.addElapsed(elapsed);
        logicer.run();
        NODES.forEach(node => {
            try {
                networkMrg.ledStatus(node.Host, ledManager.getRawLedStatus());
            } catch (error) {
                console.error(error);
            }
        });
    }

    start() {
        let self = this;
        if (!_intervalId) {
            if (_lastLedStatus != null) {
                ledManager.setRawLedStatus(_lastLedStatus);
            }
            if (_lastButtonStatus != null) {
                ledManager.setAllButtonStatus(_lastButtonStatus);
            }

            _intervalId = setInterval(() => {
                self.loop();
            }, INTERVAL);

            console.log('Loop started');
        } else {
            console.log('The loop is already running');
        }
    }

    stop() {
        if (_intervalId) {
            _lastLedStatus = ledManager.getRawLedStatus();
            _lastButtonStatus = ledManager.getAllButtonStatus();
            ledManager.resetAll();

            clearInterval(_intervalId);
            _intervalId = null;
            this.sendResetToNode();

            console.log('Loop stopped');
        } else {
            console.log('The loop is already stopped');
        }
    }

    sendResetToNode() {
        NODES.forEach(node => {
            try {
                networkMrg.ledReset(node.Host);
            } catch (error) {
                console.error(error);
            }
        });
    }

    changeMode(mode, options) {
        options = options || {};
        options.sendToNode = options.sendToNode == undefined ? true : options.sendToNode;

        _locked = true;

        ledManager.resetAll();
        if (options.sendToNode) {
            NODES.forEach(node => {
                try {
                    networkMrg.changeMode(node.Host, mode);
                } catch (error) {
                    console.error(error);
                }
            });
        }

        switch (mode) {
            case modeEnum.FREE:
                console.log('Change to Free mode.');
                _currentTask = this.runFreeMode;
                _locked = false;
                break;

            case modeEnum.ART:
                console.log('Change to Art mode.');

                let loadImages = [];
                for (let i = 0; i < 6; i++) {
                    let filePath = `./res/images/full-${i}.jpg`;
                    loadImages.push(Jimp.read(filePath));
                }

                _art.data = [];
                Promise.all(loadImages).then((values) => {
                    values.forEach(image => {
                        let data = utils.jimpImageToLedStatus(image);
                        _art.data.push(data);
                    });
                }).then(() => {
                    _art.index = 0;
                    _art.length = _art.data.length;
                    _locked = false;
                });

                _currentTask = this.runArtMode;
                break;

            case modeEnum.BLOCKLY:
                console.log('Change to Blockly mode.');
                _currentTask = this.runBlockyMode;
                _locked = false;
                break;

            default:
                _currentTask = null;
                console.error(`Set mode failed. There is no mode: ${mode}`);
                break;
        }
    }
}

module.exports = new Runner();
