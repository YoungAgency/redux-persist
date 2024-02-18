"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-explicit-any */
const redux_1 = require("redux");
const persistReducer_1 = __importDefault(require("./persistReducer"));
const autoMergeLevel2_1 = __importDefault(require("./stateReconciler/autoMergeLevel2"));
// combineReducers + persistReducer with stateReconciler defaulted to autoMergeLevel2
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function persistCombineReducers(config, reducers) {
    config.stateReconciler =
        config.stateReconciler === undefined
            ? autoMergeLevel2_1.default
            : config.stateReconciler;
    return persistReducer_1.default(config, redux_1.combineReducers(reducers));
}
exports.default = persistCombineReducers;
