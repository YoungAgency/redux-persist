import type { Persistor, PersistorOptions } from './types';
import { Store } from 'redux';
declare type BoostrappedCb = () => any;
export default function persistStore(store: Store, options?: PersistorOptions, cb?: BoostrappedCb): Persistor;
export {};
