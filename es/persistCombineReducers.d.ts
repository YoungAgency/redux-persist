import { Action, AnyAction, CombinedState, Reducer, ReducersMapObject } from 'redux';
import type { PersistConfig } from './types';
export default function persistCombineReducers<S, A extends Action>(config: PersistConfig<any>, reducers: ReducersMapObject<CombinedState<S>, Action<any>>): Reducer<any, AnyAction>;
