/*!
  ReduxPersist.js v6.1.0
  https://github.com/rt2zz/redux-persist#readme
  Released under the MIT License.
*/
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ReduxPersist = {}));
}(this, (function (exports) { 'use strict';

  function _typeof(obj) {
    "@babel/helpers - typeof";

    if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
      _typeof = function (obj) {
        return typeof obj;
      };
    } else {
      _typeof = function (obj) {
        return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
      };
    }

    return _typeof(obj);
  }

  function __rest(s, e) {
    var t = {};

    for (var p in s) {
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    }

    if (s != null && typeof Object.getOwnPropertySymbols === "function") for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
    }
    return t;
  }

  const KEY_PREFIX = 'persist:';
  const FLUSH = 'persist/FLUSH';
  const REHYDRATE = 'persist/REHYDRATE';
  const PAUSE = 'persist/PAUSE';
  const PERSIST = 'persist/PERSIST';
  const PURGE = 'persist/PURGE';
  const REGISTER = 'persist/REGISTER';
  const DEFAULT_VERSION = -1;

  /*
    autoMergeLevel1:
      - merges 1 level of substate
      - skips substate if already modified
  */
  function autoMergeLevel1(inboundState, originalState, reducedState, { debug }) {
      const newState = Object.assign({}, reducedState);
      // only rehydrate if inboundState exists and is an object
      if (inboundState && typeof inboundState === 'object') {
          const keys = Object.keys(inboundState);
          keys.forEach(key => {
              // ignore _persist data
              if (key === '_persist')
                  return;
              // if reducer modifies substate, skip auto rehydration
              if (originalState[key] !== reducedState[key]) {
                  if (process.env.NODE_ENV !== 'production' && debug)
                      console.log('redux-persist/stateReconciler: sub state for key `%s` modified, skipping.', key);
                  return;
              }
              // otherwise hard set the new value
              newState[key] = inboundState[key];
          });
      }
      if (process.env.NODE_ENV !== 'production' &&
          debug &&
          inboundState &&
          typeof inboundState === 'object')
          console.log(`redux-persist/stateReconciler: rehydrated keys '${Object.keys(inboundState).join(', ')}'`);
      return newState;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function createPersistoid(config) {
      // defaults
      const blacklist = config.blacklist || null;
      const whitelist = config.whitelist || null;
      const transforms = config.transforms || [];
      const throttle = config.throttle || 0;
      const storageKey = `${config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX}${config.key}`;
      const storage = config.storage;
      let serialize;
      if (config.serialize === false) {
          serialize = (x) => x;
      }
      else if (typeof config.serialize === 'function') {
          serialize = config.serialize;
      }
      else {
          serialize = defaultSerialize;
      }
      const writeFailHandler = config.writeFailHandler || null;
      // initialize stateful values
      let lastState = {};
      const stagedState = {};
      const keysToProcess = [];
      let timeIterator = null;
      let writePromise = null;
      const update = (state) => {
          // add any changed keys to the queue
          Object.keys(state).forEach(key => {
              if (!passWhitelistBlacklist(key))
                  return; // is keyspace ignored? noop
              if (lastState[key] === state[key])
                  return; // value unchanged? noop
              if (keysToProcess.indexOf(key) !== -1)
                  return; // is key already queued? noop
              keysToProcess.push(key); // add key to queue
          });
          //if any key is missing in the new state which was present in the lastState,
          //add it for processing too
          Object.keys(lastState).forEach(key => {
              if (state[key] === undefined &&
                  passWhitelistBlacklist(key) &&
                  keysToProcess.indexOf(key) === -1 &&
                  lastState[key] !== undefined) {
                  keysToProcess.push(key);
              }
          });
          // start the time iterator if not running (read: throttle)
          if (timeIterator === null) {
              timeIterator = setInterval(processNextKey, throttle);
          }
          lastState = state;
      };
      function processNextKey() {
          if (keysToProcess.length === 0) {
              if (timeIterator)
                  clearInterval(timeIterator);
              timeIterator = null;
              return;
          }
          const key = keysToProcess.shift();
          if (key === undefined) {
              return;
          }
          const endState = transforms.reduce((subState, transformer) => {
              return transformer.in(subState, key, lastState);
          }, lastState[key]);
          if (endState !== undefined) {
              try {
                  stagedState[key] = serialize(endState);
              }
              catch (err) {
                  console.error('redux-persist/createPersistoid: error serializing state', err);
              }
          }
          else {
              //if the endState is undefined, no need to persist the existing serialized content
              delete stagedState[key];
          }
          if (keysToProcess.length === 0) {
              writeStagedState();
          }
      }
      function writeStagedState() {
          // cleanup any removed keys just before write.
          Object.keys(stagedState).forEach(key => {
              if (lastState[key] === undefined) {
                  delete stagedState[key];
              }
          });
          writePromise = storage
              .setItem(storageKey, serialize(stagedState))
              .catch(onWriteFail);
      }
      function passWhitelistBlacklist(key) {
          if (whitelist && whitelist.indexOf(key) === -1 && key !== '_persist')
              return false;
          if (blacklist && blacklist.indexOf(key) !== -1)
              return false;
          return true;
      }
      function onWriteFail(err) {
          // @TODO add fail handlers (typically storage full)
          if (writeFailHandler)
              writeFailHandler(err);
          if (err && process.env.NODE_ENV !== 'production') {
              console.error('Error storing data', err);
          }
      }
      const flush = () => {
          while (keysToProcess.length !== 0) {
              processNextKey();
          }
          return writePromise || Promise.resolve();
      };
      // return `persistoid`
      return {
          update,
          flush,
      };
  }
  // @NOTE in the future this may be exposed via config
  function defaultSerialize(data) {
      return JSON.stringify(data);
  }

  function getStoredState(config) {
      const transforms = config.transforms || [];
      const storageKey = `${config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX}${config.key}`;
      const storage = config.storage;
      const debug = config.debug;
      let deserialize;
      if (config.deserialize === false) {
          deserialize = (x) => x;
      }
      else if (typeof config.deserialize === 'function') {
          deserialize = config.deserialize;
      }
      else {
          deserialize = defaultDeserialize;
      }
      return storage.getItem(storageKey).then((serialized) => {
          if (!serialized)
              return undefined;
          else {
              try {
                  const state = {};
                  const rawState = deserialize(serialized);
                  Object.keys(rawState).forEach(key => {
                      state[key] = transforms.reduceRight((subState, transformer) => {
                          return transformer.out(subState, key, rawState);
                      }, deserialize(rawState[key]));
                  });
                  return state;
              }
              catch (err) {
                  if (process.env.NODE_ENV !== 'production' && debug)
                      console.log(`redux-persist/getStoredState: Error restoring data ${serialized}`, err);
                  throw err;
              }
          }
      });
  }
  function defaultDeserialize(serial) {
      return JSON.parse(serial);
  }

  function purgeStoredState(config) {
      const storage = config.storage;
      const storageKey = `${config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX}${config.key}`;
      return storage.removeItem(storageKey, warnIfRemoveError);
  }
  function warnIfRemoveError(err) {
      if (err && process.env.NODE_ENV !== 'production') {
          console.error('redux-persist/purgeStoredState: Error purging data stored state', err);
      }
  }

  const DEFAULT_TIMEOUT = 5000;
  /*
    @TODO add validation / handling for:
    - persisting a reducer which has nested _persist
    - handling actions that fire before reydrate is called
  */
  function persistReducer(config, baseReducer) {
      if (process.env.NODE_ENV !== 'production') {
          if (!config)
              throw new Error('config is required for persistReducer');
          if (!config.key)
              throw new Error('key is required in persistor config');
          if (!config.storage)
              throw new Error("redux-persist: config.storage is required. Try using one of the provided storage engines `import storage from 'redux-persist/lib/storage'`");
      }
      const version = config.version !== undefined ? config.version : DEFAULT_VERSION;
      const stateReconciler = config.stateReconciler === undefined
          ? autoMergeLevel1
          : config.stateReconciler;
      const getStoredState$1 = config.getStoredState || getStoredState;
      const timeout = config.timeout !== undefined ? config.timeout : DEFAULT_TIMEOUT;
      let _persistoid = null;
      let _purge = false;
      let _paused = true;
      const conditionalUpdate = (state) => {
          // update the persistoid only if we are rehydrated and not paused
          state._persist.rehydrated &&
              _persistoid &&
              !_paused &&
              _persistoid.update(state);
          return state;
      };
      return (state, action) => {
          const _a = state || {}, { _persist } = _a, rest = __rest(_a, ["_persist"]);
          const restState = rest;
          if (action.type === PERSIST) {
              let _sealed = false;
              const _rehydrate = (payload, err) => {
                  // dev warning if we are already sealed
                  if (process.env.NODE_ENV !== 'production' && _sealed)
                      console.error(`redux-persist: rehydrate for "${config.key}" called after timeout.`, payload, err);
                  // only rehydrate if we are not already sealed
                  if (!_sealed) {
                      action.rehydrate(config.key, payload, err);
                      _sealed = true;
                  }
              };
              timeout &&
                  setTimeout(() => {
                      !_sealed &&
                          _rehydrate(undefined, new Error(`redux-persist: persist timed out for persist key "${config.key}"`));
                  }, timeout);
              // @NOTE PERSIST resumes if paused.
              _paused = false;
              // @NOTE only ever create persistoid once, ensure we call it at least once, even if _persist has already been set
              if (!_persistoid)
                  _persistoid = createPersistoid(config);
              // @NOTE PERSIST can be called multiple times, noop after the first
              if (_persist) {
                  // We still need to call the base reducer because there might be nested
                  // uses of persistReducer which need to be aware of the PERSIST action
                  return Object.assign(Object.assign({}, baseReducer(restState, action)), { _persist });
              }
              if (typeof action.rehydrate !== 'function' ||
                  typeof action.register !== 'function')
                  throw new Error('redux-persist: either rehydrate or register is not a function on the PERSIST action. This can happen if the action is being replayed. This is an unexplored use case, please open an issue and we will figure out a resolution.');
              action.register(config.key);
              getStoredState$1(config).then(restoredState => {
                  if (restoredState) {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const migrate = config.migrate || ((s, _) => Promise.resolve(s));
                      migrate(restoredState, version).then(migratedState => {
                          _rehydrate(migratedState);
                      }, migrateErr => {
                          if (process.env.NODE_ENV !== 'production' && migrateErr)
                              console.error('redux-persist: migration error', migrateErr);
                          _rehydrate(undefined, migrateErr);
                      });
                  }
              }, err => {
                  _rehydrate(undefined, err);
              });
              return Object.assign(Object.assign({}, baseReducer(restState, action)), { _persist: { version, rehydrated: false } });
          }
          else if (action.type === PURGE) {
              _purge = true;
              action.result(purgeStoredState(config));
              return Object.assign(Object.assign({}, baseReducer(restState, action)), { _persist });
          }
          else if (action.type === FLUSH) {
              action.result(_persistoid && _persistoid.flush());
              return Object.assign(Object.assign({}, baseReducer(restState, action)), { _persist });
          }
          else if (action.type === PAUSE) {
              _paused = true;
          }
          else if (action.type === REHYDRATE) {
              // noop on restState if purging
              if (_purge)
                  return Object.assign(Object.assign({}, restState), { _persist: Object.assign(Object.assign({}, _persist), { rehydrated: true }) });
              // @NOTE if key does not match, will continue to default else below
              if (action.key === config.key) {
                  const reducedState = baseReducer(restState, action);
                  const inboundState = action.payload;
                  // only reconcile state if stateReconciler and inboundState are both defined
                  const reconciledRest = stateReconciler !== false && inboundState !== undefined
                      ? stateReconciler(inboundState, state, reducedState, config)
                      : reducedState;
                  const newState = Object.assign(Object.assign({}, reconciledRest), { _persist: Object.assign(Object.assign({}, _persist), { rehydrated: true }) });
                  return conditionalUpdate(newState);
              }
          }
          // if we have not already handled PERSIST, straight passthrough
          if (!_persist)
              return baseReducer(state, action);
          // run base reducer:
          // is state modified ? return original : return updated
          const newState = baseReducer(restState, action);
          if (newState === restState)
              return state;
          return conditionalUpdate(Object.assign(Object.assign({}, newState), { _persist }));
      };
  }

  /**
   * Adapted from React: https://github.com/facebook/react/blob/master/packages/shared/formatProdErrorMessage.js
   *
   * Do not require this module directly! Use normal throw error calls. These messages will be replaced with error codes
   * during build.
   * @param {number} code
   */

  function formatProdErrorMessage(code) {
    return "Minified Redux error #" + code + "; visit https://redux.js.org/Errors?code=" + code + " for the full message or " + 'use the non-minified dev environment for full errors. ';
  } // Inlined version of the `symbol-observable` polyfill


  var $$observable = function () {
    return typeof Symbol === 'function' && Symbol.observable || '@@observable';
  }();
  /**
   * These are private action types reserved by Redux.
   * For any unknown actions, you must return the current state.
   * If the current state is undefined, you must return the initial state.
   * Do not reference these action types directly in your code.
   */


  var randomString = function randomString() {
    return Math.random().toString(36).substring(7).split('').join('.');
  };

  var ActionTypes = {
    INIT: "@@redux/INIT" + randomString(),
    REPLACE: "@@redux/REPLACE" + randomString(),
    PROBE_UNKNOWN_ACTION: function PROBE_UNKNOWN_ACTION() {
      return "@@redux/PROBE_UNKNOWN_ACTION" + randomString();
    }
  };
  /**
   * @param {any} obj The object to inspect.
   * @returns {boolean} True if the argument appears to be a plain object.
   */

  function isPlainObject(obj) {
    if (_typeof(obj) !== 'object' || obj === null) return false;
    var proto = obj;

    while (Object.getPrototypeOf(proto) !== null) {
      proto = Object.getPrototypeOf(proto);
    }

    return Object.getPrototypeOf(obj) === proto;
  } // Inlined / shortened version of `kindOf` from https://github.com/jonschlinkert/kind-of


  function miniKindOf(val) {
    if (val === void 0) return 'undefined';
    if (val === null) return 'null';

    var type = _typeof(val);

    switch (type) {
      case 'boolean':
      case 'string':
      case 'number':
      case 'symbol':
      case 'function':
        {
          return type;
        }
    }

    if (Array.isArray(val)) return 'array';
    if (isDate(val)) return 'date';
    if (isError(val)) return 'error';
    var constructorName = ctorName(val);

    switch (constructorName) {
      case 'Symbol':
      case 'Promise':
      case 'WeakMap':
      case 'WeakSet':
      case 'Map':
      case 'Set':
        return constructorName;
    } // other


    return type.slice(8, -1).toLowerCase().replace(/\s/g, '');
  }

  function ctorName(val) {
    return typeof val.constructor === 'function' ? val.constructor.name : null;
  }

  function isError(val) {
    return val instanceof Error || typeof val.message === 'string' && val.constructor && typeof val.constructor.stackTraceLimit === 'number';
  }

  function isDate(val) {
    if (val instanceof Date) return true;
    return typeof val.toDateString === 'function' && typeof val.getDate === 'function' && typeof val.setDate === 'function';
  }

  function kindOf(val) {
    var typeOfVal = _typeof(val);

    if (process.env.NODE_ENV !== 'production') {
      typeOfVal = miniKindOf(val);
    }

    return typeOfVal;
  }
  /**
   * Creates a Redux store that holds the state tree.
   * The only way to change the data in the store is to call `dispatch()` on it.
   *
   * There should only be a single store in your app. To specify how different
   * parts of the state tree respond to actions, you may combine several reducers
   * into a single reducer function by using `combineReducers`.
   *
   * @param {Function} reducer A function that returns the next state tree, given
   * the current state tree and the action to handle.
   *
   * @param {any} [preloadedState] The initial state. You may optionally specify it
   * to hydrate the state from the server in universal apps, or to restore a
   * previously serialized user session.
   * If you use `combineReducers` to produce the root reducer function, this must be
   * an object with the same shape as `combineReducers` keys.
   *
   * @param {Function} [enhancer] The store enhancer. You may optionally specify it
   * to enhance the store with third-party capabilities such as middleware,
   * time travel, persistence, etc. The only store enhancer that ships with Redux
   * is `applyMiddleware()`.
   *
   * @returns {Store} A Redux store that lets you read the state, dispatch actions
   * and subscribe to changes.
   */


  function createStore(reducer, preloadedState, enhancer) {
    var _ref2;

    if (typeof preloadedState === 'function' && typeof enhancer === 'function' || typeof enhancer === 'function' && typeof arguments[3] === 'function') {
      throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(0) : 'It looks like you are passing several store enhancers to ' + 'createStore(). This is not supported. Instead, compose them ' + 'together to a single function. See https://redux.js.org/tutorials/fundamentals/part-4-store#creating-a-store-with-enhancers for an example.');
    }

    if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
      enhancer = preloadedState;
      preloadedState = undefined;
    }

    if (typeof enhancer !== 'undefined') {
      if (typeof enhancer !== 'function') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(1) : "Expected the enhancer to be a function. Instead, received: '" + kindOf(enhancer) + "'");
      }

      return enhancer(createStore)(reducer, preloadedState);
    }

    if (typeof reducer !== 'function') {
      throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(2) : "Expected the root reducer to be a function. Instead, received: '" + kindOf(reducer) + "'");
    }

    var currentReducer = reducer;
    var currentState = preloadedState;
    var currentListeners = [];
    var nextListeners = currentListeners;
    var isDispatching = false;
    /**
     * This makes a shallow copy of currentListeners so we can use
     * nextListeners as a temporary list while dispatching.
     *
     * This prevents any bugs around consumers calling
     * subscribe/unsubscribe in the middle of a dispatch.
     */

    function ensureCanMutateNextListeners() {
      if (nextListeners === currentListeners) {
        nextListeners = currentListeners.slice();
      }
    }
    /**
     * Reads the state tree managed by the store.
     *
     * @returns {any} The current state tree of your application.
     */


    function getState() {
      if (isDispatching) {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(3) : 'You may not call store.getState() while the reducer is executing. ' + 'The reducer has already received the state as an argument. ' + 'Pass it down from the top reducer instead of reading it from the store.');
      }

      return currentState;
    }
    /**
     * Adds a change listener. It will be called any time an action is dispatched,
     * and some part of the state tree may potentially have changed. You may then
     * call `getState()` to read the current state tree inside the callback.
     *
     * You may call `dispatch()` from a change listener, with the following
     * caveats:
     *
     * 1. The subscriptions are snapshotted just before every `dispatch()` call.
     * If you subscribe or unsubscribe while the listeners are being invoked, this
     * will not have any effect on the `dispatch()` that is currently in progress.
     * However, the next `dispatch()` call, whether nested or not, will use a more
     * recent snapshot of the subscription list.
     *
     * 2. The listener should not expect to see all state changes, as the state
     * might have been updated multiple times during a nested `dispatch()` before
     * the listener is called. It is, however, guaranteed that all subscribers
     * registered before the `dispatch()` started will be called with the latest
     * state by the time it exits.
     *
     * @param {Function} listener A callback to be invoked on every dispatch.
     * @returns {Function} A function to remove this change listener.
     */


    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(4) : "Expected the listener to be a function. Instead, received: '" + kindOf(listener) + "'");
      }

      if (isDispatching) {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(5) : 'You may not call store.subscribe() while the reducer is executing. ' + 'If you would like to be notified after the store has been updated, subscribe from a ' + 'component and invoke store.getState() in the callback to access the latest state. ' + 'See https://redux.js.org/api/store#subscribelistener for more details.');
      }

      var isSubscribed = true;
      ensureCanMutateNextListeners();
      nextListeners.push(listener);
      return function unsubscribe() {
        if (!isSubscribed) {
          return;
        }

        if (isDispatching) {
          throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(6) : 'You may not unsubscribe from a store listener while the reducer is executing. ' + 'See https://redux.js.org/api/store#subscribelistener for more details.');
        }

        isSubscribed = false;
        ensureCanMutateNextListeners();
        var index = nextListeners.indexOf(listener);
        nextListeners.splice(index, 1);
        currentListeners = null;
      };
    }
    /**
     * Dispatches an action. It is the only way to trigger a state change.
     *
     * The `reducer` function, used to create the store, will be called with the
     * current state tree and the given `action`. Its return value will
     * be considered the **next** state of the tree, and the change listeners
     * will be notified.
     *
     * The base implementation only supports plain object actions. If you want to
     * dispatch a Promise, an Observable, a thunk, or something else, you need to
     * wrap your store creating function into the corresponding middleware. For
     * example, see the documentation for the `redux-thunk` package. Even the
     * middleware will eventually dispatch plain object actions using this method.
     *
     * @param {Object} action A plain object representing “what changed”. It is
     * a good idea to keep actions serializable so you can record and replay user
     * sessions, or use the time travelling `redux-devtools`. An action must have
     * a `type` property which may not be `undefined`. It is a good idea to use
     * string constants for action types.
     *
     * @returns {Object} For convenience, the same action object you dispatched.
     *
     * Note that, if you use a custom middleware, it may wrap `dispatch()` to
     * return something else (for example, a Promise you can await).
     */


    function dispatch(action) {
      if (!isPlainObject(action)) {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(7) : "Actions must be plain objects. Instead, the actual type was: '" + kindOf(action) + "'. You may need to add middleware to your store setup to handle dispatching other values, such as 'redux-thunk' to handle dispatching functions. See https://redux.js.org/tutorials/fundamentals/part-4-store#middleware and https://redux.js.org/tutorials/fundamentals/part-6-async-logic#using-the-redux-thunk-middleware for examples.");
      }

      if (typeof action.type === 'undefined') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(8) : 'Actions may not have an undefined "type" property. You may have misspelled an action type string constant.');
      }

      if (isDispatching) {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(9) : 'Reducers may not dispatch actions.');
      }

      try {
        isDispatching = true;
        currentState = currentReducer(currentState, action);
      } finally {
        isDispatching = false;
      }

      var listeners = currentListeners = nextListeners;

      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        listener();
      }

      return action;
    }
    /**
     * Replaces the reducer currently used by the store to calculate the state.
     *
     * You might need this if your app implements code splitting and you want to
     * load some of the reducers dynamically. You might also need this if you
     * implement a hot reloading mechanism for Redux.
     *
     * @param {Function} nextReducer The reducer for the store to use instead.
     * @returns {void}
     */


    function replaceReducer(nextReducer) {
      if (typeof nextReducer !== 'function') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(10) : "Expected the nextReducer to be a function. Instead, received: '" + kindOf(nextReducer));
      }

      currentReducer = nextReducer; // This action has a similiar effect to ActionTypes.INIT.
      // Any reducers that existed in both the new and old rootReducer
      // will receive the previous state. This effectively populates
      // the new state tree with any relevant data from the old one.

      dispatch({
        type: ActionTypes.REPLACE
      });
    }
    /**
     * Interoperability point for observable/reactive libraries.
     * @returns {observable} A minimal observable of state changes.
     * For more information, see the observable proposal:
     * https://github.com/tc39/proposal-observable
     */


    function observable() {
      var _ref;

      var outerSubscribe = subscribe;
      return _ref = {
        /**
         * The minimal observable subscription method.
         * @param {Object} observer Any object that can be used as an observer.
         * The observer object should have a `next` method.
         * @returns {subscription} An object with an `unsubscribe` method that can
         * be used to unsubscribe the observable from the store, and prevent further
         * emission of values from the observable.
         */
        subscribe: function subscribe(observer) {
          if (_typeof(observer) !== 'object' || observer === null) {
            throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(11) : "Expected the observer to be an object. Instead, received: '" + kindOf(observer) + "'");
          }

          function observeState() {
            if (observer.next) {
              observer.next(getState());
            }
          }

          observeState();
          var unsubscribe = outerSubscribe(observeState);
          return {
            unsubscribe: unsubscribe
          };
        }
      }, _ref[$$observable] = function () {
        return this;
      }, _ref;
    } // When a store is created, an "INIT" action is dispatched so that every
    // reducer returns their initial state. This effectively populates
    // the initial state tree.


    dispatch({
      type: ActionTypes.INIT
    });
    return _ref2 = {
      dispatch: dispatch,
      subscribe: subscribe,
      getState: getState,
      replaceReducer: replaceReducer
    }, _ref2[$$observable] = observable, _ref2;
  }
  /**
   * Prints a warning in the console if it exists.
   *
   * @param {String} message The warning message.
   * @returns {void}
   */


  function warning(message) {
    /* eslint-disable no-console */
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(message);
    }
    /* eslint-enable no-console */


    try {
      // This error was thrown as a convenience so that if you enable
      // "break on all exceptions" in your console,
      // it would pause the execution at this line.
      throw new Error(message);
    } catch (e) {} // eslint-disable-line no-empty

  }

  function getUnexpectedStateShapeWarningMessage(inputState, reducers, action, unexpectedKeyCache) {
    var reducerKeys = Object.keys(reducers);
    var argumentName = action && action.type === ActionTypes.INIT ? 'preloadedState argument passed to createStore' : 'previous state received by the reducer';

    if (reducerKeys.length === 0) {
      return 'Store does not have a valid reducer. Make sure the argument passed ' + 'to combineReducers is an object whose values are reducers.';
    }

    if (!isPlainObject(inputState)) {
      return "The " + argumentName + " has unexpected type of \"" + kindOf(inputState) + "\". Expected argument to be an object with the following " + ("keys: \"" + reducerKeys.join('", "') + "\"");
    }

    var unexpectedKeys = Object.keys(inputState).filter(function (key) {
      return !reducers.hasOwnProperty(key) && !unexpectedKeyCache[key];
    });
    unexpectedKeys.forEach(function (key) {
      unexpectedKeyCache[key] = true;
    });
    if (action && action.type === ActionTypes.REPLACE) return;

    if (unexpectedKeys.length > 0) {
      return "Unexpected " + (unexpectedKeys.length > 1 ? 'keys' : 'key') + " " + ("\"" + unexpectedKeys.join('", "') + "\" found in " + argumentName + ". ") + "Expected to find one of the known reducer keys instead: " + ("\"" + reducerKeys.join('", "') + "\". Unexpected keys will be ignored.");
    }
  }

  function assertReducerShape(reducers) {
    Object.keys(reducers).forEach(function (key) {
      var reducer = reducers[key];
      var initialState = reducer(undefined, {
        type: ActionTypes.INIT
      });

      if (typeof initialState === 'undefined') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(12) : "The slice reducer for key \"" + key + "\" returned undefined during initialization. " + "If the state passed to the reducer is undefined, you must " + "explicitly return the initial state. The initial state may " + "not be undefined. If you don't want to set a value for this reducer, " + "you can use null instead of undefined.");
      }

      if (typeof reducer(undefined, {
        type: ActionTypes.PROBE_UNKNOWN_ACTION()
      }) === 'undefined') {
        throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(13) : "The slice reducer for key \"" + key + "\" returned undefined when probed with a random type. " + ("Don't try to handle '" + ActionTypes.INIT + "' or other actions in \"redux/*\" ") + "namespace. They are considered private. Instead, you must return the " + "current state for any unknown actions, unless it is undefined, " + "in which case you must return the initial state, regardless of the " + "action type. The initial state may not be undefined, but can be null.");
      }
    });
  }
  /**
   * Turns an object whose values are different reducer functions, into a single
   * reducer function. It will call every child reducer, and gather their results
   * into a single state object, whose keys correspond to the keys of the passed
   * reducer functions.
   *
   * @param {Object} reducers An object whose values correspond to different
   * reducer functions that need to be combined into one. One handy way to obtain
   * it is to use ES6 `import * as reducers` syntax. The reducers may never return
   * undefined for any action. Instead, they should return their initial state
   * if the state passed to them was undefined, and the current state for any
   * unrecognized action.
   *
   * @returns {Function} A reducer function that invokes every reducer inside the
   * passed object, and builds a state object with the same shape.
   */


  function combineReducers(reducers) {
    var reducerKeys = Object.keys(reducers);
    var finalReducers = {};

    for (var i = 0; i < reducerKeys.length; i++) {
      var key = reducerKeys[i];

      if (process.env.NODE_ENV !== 'production') {
        if (typeof reducers[key] === 'undefined') {
          warning("No reducer provided for key \"" + key + "\"");
        }
      }

      if (typeof reducers[key] === 'function') {
        finalReducers[key] = reducers[key];
      }
    }

    var finalReducerKeys = Object.keys(finalReducers); // This is used to make sure we don't warn about the same
    // keys multiple times.

    var unexpectedKeyCache;

    if (process.env.NODE_ENV !== 'production') {
      unexpectedKeyCache = {};
    }

    var shapeAssertionError;

    try {
      assertReducerShape(finalReducers);
    } catch (e) {
      shapeAssertionError = e;
    }

    return function combination(state, action) {
      if (state === void 0) {
        state = {};
      }

      if (shapeAssertionError) {
        throw shapeAssertionError;
      }

      if (process.env.NODE_ENV !== 'production') {
        var warningMessage = getUnexpectedStateShapeWarningMessage(state, finalReducers, action, unexpectedKeyCache);

        if (warningMessage) {
          warning(warningMessage);
        }
      }

      var hasChanged = false;
      var nextState = {};

      for (var _i = 0; _i < finalReducerKeys.length; _i++) {
        var _key = finalReducerKeys[_i];
        var reducer = finalReducers[_key];
        var previousStateForKey = state[_key];
        var nextStateForKey = reducer(previousStateForKey, action);

        if (typeof nextStateForKey === 'undefined') {
          var actionType = action && action.type;
          throw new Error(process.env.NODE_ENV === "production" ? formatProdErrorMessage(14) : "When called with an action of type " + (actionType ? "\"" + String(actionType) + "\"" : '(unknown type)') + ", the slice reducer for key \"" + _key + "\" returned undefined. " + "To ignore an action, you must explicitly return the previous state. " + "If you want this reducer to hold no value, you can return null instead of undefined.");
        }

        nextState[_key] = nextStateForKey;
        hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
      }

      hasChanged = hasChanged || finalReducerKeys.length !== Object.keys(state).length;
      return hasChanged ? nextState : state;
    };
  }
  /*
   * This is a dummy function to check if the function name has been altered by minification.
   * If the function has been minified and NODE_ENV !== 'production', warn the user.
   */


  function isCrushed() {}

  if (process.env.NODE_ENV !== 'production' && typeof isCrushed.name === 'string' && isCrushed.name !== 'isCrushed') {
    warning('You are currently using minified code outside of NODE_ENV === "production". ' + 'This means that you are running a slower development build of Redux. ' + 'You can use loose-envify (https://github.com/zertosh/loose-envify) for browserify ' + 'or setting mode to production in webpack (https://webpack.js.org/concepts/mode/) ' + 'to ensure you have the correct code for your production build.');
  }

  /*
    autoMergeLevel2:
      - merges 2 level of substate
      - skips substate if already modified
      - this is essentially redux-perist v4 behavior
  */
  function autoMergeLevel2(inboundState, originalState, reducedState, { debug }) {
      const newState = Object.assign({}, reducedState);
      // only rehydrate if inboundState exists and is an object
      if (inboundState && typeof inboundState === 'object') {
          const keys = Object.keys(inboundState);
          keys.forEach(key => {
              // ignore _persist data
              if (key === '_persist')
                  return;
              // if reducer modifies substate, skip auto rehydration
              if (originalState[key] !== reducedState[key]) {
                  if (process.env.NODE_ENV !== 'production' && debug)
                      console.log('redux-persist/stateReconciler: sub state for key `%s` modified, skipping.', key);
                  return;
              }
              if (isPlainEnoughObject(reducedState[key])) {
                  // if object is plain enough shallow merge the new values (hence "Level2")
                  newState[key] = Object.assign(Object.assign({}, newState[key]), inboundState[key]);
                  return;
              }
              // otherwise hard set
              newState[key] = inboundState[key];
          });
      }
      if (process.env.NODE_ENV !== 'production' &&
          debug &&
          inboundState &&
          typeof inboundState === 'object')
          console.log(`redux-persist/stateReconciler: rehydrated keys '${Object.keys(inboundState).join(', ')}'`);
      return newState;
  }
  function isPlainEnoughObject(o) {
      return o !== null && !Array.isArray(o) && typeof o === 'object';
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // combineReducers + persistReducer with stateReconciler defaulted to autoMergeLevel2
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function persistCombineReducers(config, reducers) {
      config.stateReconciler =
          config.stateReconciler === undefined
              ? autoMergeLevel2
              : config.stateReconciler;
      return persistReducer(config, combineReducers(reducers));
  }

  const initialState = {
      registry: [],
      bootstrapped: false,
  };
  const persistorReducer = (state = initialState, action) => {
      const firstIndex = state.registry.indexOf(action.key);
      const registry = [...state.registry];
      switch (action.type) {
          case REGISTER:
              return Object.assign(Object.assign({}, state), { registry: [...state.registry, action.key] });
          case REHYDRATE:
              registry.splice(firstIndex, 1);
              return Object.assign(Object.assign({}, state), { registry, bootstrapped: registry.length === 0 });
          default:
              return state;
      }
  };
  function persistStore(store, options, cb) {
      // help catch incorrect usage of passing PersistConfig in as PersistorOptions
      if (process.env.NODE_ENV !== 'production') {
          const optionsToTest = options || {};
          const bannedKeys = [
              'blacklist',
              'whitelist',
              'transforms',
              'storage',
              'keyPrefix',
              'migrate',
          ];
          bannedKeys.forEach(k => {
              if (optionsToTest[k])
                  console.error(`redux-persist: invalid option passed to persistStore: "${k}". You may be incorrectly passing persistConfig into persistStore, whereas it should be passed into persistReducer.`);
          });
      }
      let boostrappedCb = cb || false;
      const _pStore = createStore(persistorReducer, initialState, options && options.enhancer ? options.enhancer : undefined);
      const register = (key) => {
          _pStore.dispatch({
              type: REGISTER,
              key,
          });
      };
      const rehydrate = (key, payload, err) => {
          const rehydrateAction = {
              type: REHYDRATE,
              payload,
              err,
              key,
          };
          // dispatch to `store` to rehydrate and `persistor` to track result
          store.dispatch(rehydrateAction);
          _pStore.dispatch(rehydrateAction);
          if (typeof boostrappedCb === "function" && persistor.getState().bootstrapped) {
              boostrappedCb();
              boostrappedCb = false;
          }
      };
      const persistor = Object.assign(Object.assign({}, _pStore), { purge: () => {
              const results = [];
              store.dispatch({
                  type: PURGE,
                  result: (purgeResult) => {
                      results.push(purgeResult);
                  },
              });
              return Promise.all(results);
          }, flush: () => {
              const results = [];
              store.dispatch({
                  type: FLUSH,
                  result: (flushResult) => {
                      results.push(flushResult);
                  },
              });
              return Promise.all(results);
          }, pause: () => {
              store.dispatch({
                  type: PAUSE,
              });
          }, persist: () => {
              store.dispatch({ type: PERSIST, register, rehydrate });
          } });
      if (!(options && options.manualPersist)) {
          persistor.persist();
      }
      return persistor;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function createMigrate(migrations, config) {
      const { debug } = config || {};
      return function (state, currentVersion) {
          if (!state) {
              if (process.env.NODE_ENV !== 'production' && debug)
                  console.log('redux-persist: no inbound state, skipping migration');
              return Promise.resolve(undefined);
          }
          const inboundVersion = state._persist && state._persist.version !== undefined
              ? state._persist.version
              : DEFAULT_VERSION;
          if (inboundVersion === currentVersion) {
              if (process.env.NODE_ENV !== 'production' && debug)
                  console.log('redux-persist: versions match, noop migration');
              return Promise.resolve(state);
          }
          if (inboundVersion > currentVersion) {
              if (process.env.NODE_ENV !== 'production')
                  console.error('redux-persist: downgrading version is not supported');
              return Promise.resolve(state);
          }
          const migrationKeys = Object.keys(migrations)
              .map(ver => parseInt(ver))
              .filter(key => currentVersion >= key && key > inboundVersion)
              .sort((a, b) => a - b);
          if (process.env.NODE_ENV !== 'production' && debug)
              console.log('redux-persist: migrationKeys', migrationKeys);
          try {
              const migratedState = migrationKeys.reduce((state, versionKey) => {
                  if (process.env.NODE_ENV !== 'production' && debug)
                      console.log('redux-persist: running migration for versionKey', versionKey);
                  return migrations[versionKey](state);
              }, state);
              return Promise.resolve(migratedState);
          }
          catch (err) {
              return Promise.reject(err);
          }
      };
  }

  function createTransform(
  // @NOTE inbound: transform state coming from redux on its way to being serialized and stored
  // eslint-disable-next-line @typescript-eslint/ban-types
  inbound, 
  // @NOTE outbound: transform state coming from storage, on its way to be rehydrated into redux
  // eslint-disable-next-line @typescript-eslint/ban-types
  outbound, config = {}) {
      const whitelist = config.whitelist || null;
      const blacklist = config.blacklist || null;
      function whitelistBlacklistCheck(key) {
          if (whitelist && whitelist.indexOf(key) === -1)
              return true;
          if (blacklist && blacklist.indexOf(key) !== -1)
              return true;
          return false;
      }
      return {
          in: (state, key, fullState) => !whitelistBlacklistCheck(key) && inbound
              ? inbound(state, key, fullState)
              : state,
          out: (state, key, fullState) => !whitelistBlacklistCheck(key) && outbound
              ? outbound(state, key, fullState)
              : state,
      };
  }

  exports.DEFAULT_VERSION = DEFAULT_VERSION;
  exports.FLUSH = FLUSH;
  exports.KEY_PREFIX = KEY_PREFIX;
  exports.PAUSE = PAUSE;
  exports.PERSIST = PERSIST;
  exports.PURGE = PURGE;
  exports.REGISTER = REGISTER;
  exports.REHYDRATE = REHYDRATE;
  exports.createMigrate = createMigrate;
  exports.createPersistoid = createPersistoid;
  exports.createTransform = createTransform;
  exports.getStoredState = getStoredState;
  exports.persistCombineReducers = persistCombineReducers;
  exports.persistReducer = persistReducer;
  exports.persistStore = persistStore;
  exports.purgeStoredState = purgeStoredState;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=redux-persist.js.map
