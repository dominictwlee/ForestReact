(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(['module', 'exports', 'react', 'react-dom', 'superagent', 'lodash', './forest-core'], factory);
  } else if (typeof exports !== "undefined") {
    factory(module, exports, require('react'), require('react-dom'), require('superagent'), require('lodash'), require('./forest-core'));
  } else {
    var mod = {
      exports: {}
    };
    factory(mod, mod.exports, global.react, global.reactDom, global.superagent, global.lodash, global.forestCore);
    global.forestCommon = mod.exports;
  }
})(this, function (module, exports, _react, _reactDom, _superagent, _lodash, _forestCore) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  var _react2 = _interopRequireDefault(_react);

  var _reactDom2 = _interopRequireDefault(_reactDom);

  var _superagent2 = _interopRequireDefault(_superagent);

  var _lodash2 = _interopRequireDefault(_lodash);

  var _forestCore2 = _interopRequireDefault(_forestCore);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  var _createClass = function () {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  }();

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  var uid2notify = {};
  var notify2ws = {};

  function doGet(url) {
    return fetch(url).then(function (res) {
      return res.json();
    });
  }

  function doPost(o) {
    var data = _lodash2.default.omit(o, _forestCore2.default.localProps);
    var uid = o.Notifying;
    return _superagent2.default.post(uid).timeout({ response: 9000, deadline: 10000 }).set('Notify', _forestCore2.default.notifyUID).send(data).then(function (x) {
      return x;
    }).catch(function (e) {
      return console.error(e);
    });
  }

  _forestCore2.default.setNetwork({ doGet: doGet, doPost: doPost });

  var ForestCommon = function (_Component) {
    _inherits(ForestCommon, _Component);

    _createClass(ForestCommon, null, [{
      key: 'wsInit',
      value: function wsInit(host, port) {
        var ws = new WebSocket('ws://' + host + ':' + port);

        ws.onopen = function () {
          ws.send(JSON.stringify({ notifyUID: _forestCore2.default.notifyUID }));
        };

        ws.onmessage = function (message) {
          var json = JSON.parse(message.data);
          if (json.notifyUID) {
            console.log('ws init:', json);
            notify2ws[json.notifyUID] = ws;
          } else if (json.UID) {
            console.log('ws incoming object:', json);
            var o = _forestCore2.default.objects[json.UID];
            if (o) _forestCore2.default.setObjectState(json.UID, json);else _forestCore2.default.storeObject(json);
          }
        };

        ws.onerror = function (error) {};
      }
    }, {
      key: 'cacheObjects',
      value: function cacheObjects(list) {
        return _forestCore2.default.cacheObjects(list);
      }
    }, {
      key: 'renderDOM',
      value: function renderDOM(Cpt) {
        var rootId = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'root';

        return new Promise(function (resolve, reject) {
          _reactDom2.default.render(Cpt, document.getElementById(rootId), function (err) {
            return err ? reject(err) : resolve();
          });
        });
      }
    }, {
      key: 'spawnObject',
      value: function spawnObject(o) {
        return _forestCore2.default.spawnObject(o);
      }
    }, {
      key: 'runEvaluator',
      value: function runEvaluator(uid, params) {
        _forestCore2.default.runEvaluator(uid, params);
      }
    }]);

    function ForestCommon(props) {
      _classCallCheck(this, ForestCommon);

      var _this = _possibleConstructorReturn(this, (ForestCommon.__proto__ || Object.getPrototypeOf(ForestCommon)).call(this, props));

      _this.mounted = false;
      _this.KEY_ENTER = 13;

      if (props.uid) {
        _this.state = _forestCore2.default.objects[props.uid];
        _this.UID = props.uid;
      } else {
        _this.state = {};
        _this.UID = undefined;
      }
      _this.userStateUID = _forestCore2.default.spawnObject({ 'is': ['user', 'state'] });
      _this.state.userState = _this.userStateUID; // hardwiring from obj to react
      _this.object = _this.object.bind(_this);
      _this.notify = _this.notify.bind(_this);
      _this.state.ReactNotify = _this.notify; // hardwiring from obj to react
      return _this;
    }

    _createClass(ForestCommon, [{
      key: 'componentDidMount',
      value: function componentDidMount() {
        this.mounted = true;_forestCore2.default.doEvaluate(this.UID);
      }
    }, {
      key: 'componentWillUnmount',
      value: function componentWillUnmount() {
        this.mounted = false;
      }
    }, {
      key: 'object',
      value: function object(path, match) {
        return _forestCore2.default.object(this.UID, path, match);
      }
    }, {
      key: 'notify',
      value: function notify() {
        if (this.mounted) this.setState({});
      }
    }, {
      key: 'onRead',
      value: function onRead(name) {
        var value = this.object(name);
        _forestCore2.default.setObjectState(this.userStateUID, _defineProperty({}, name, value));
        return value;
      }
    }, {
      key: 'onChange',
      value: function onChange(name, value) {
        _forestCore2.default.setObjectState(this.userStateUID, _defineProperty({}, name, value));
      }
    }, {
      key: 'onKeyDown',
      value: function onKeyDown(name, e) {
        if (e.keyCode !== this.KEY_ENTER) {
          _forestCore2.default.setObjectState(this.userStateUID, _defineProperty({}, name + '-submitted', false));
          return;
        }
        _forestCore2.default.setObjectState(this.userStateUID, _defineProperty({}, name + '-submitted', true));
        e.preventDefault();
      }
    }]);

    return ForestCommon;
  }(_react.Component);

  exports.default = ForestCommon;
  module.exports = exports['default'];
});