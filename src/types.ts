/* tslint:disable:no-shadowed-variable */
import * as React from 'react';
import { Draft } from 'immer';

export type Selector<State> = (nextState: State) => any[] | boolean;
export type SelectorSetter<State> = (selector: Selector<State>) => void;

export type Dispatcher<Action extends Record<string, Function>> = { [k in keyof Action]: Action[k] };

export type Updater = () => void;

export interface IDefReducer {
  [key: string]: any;
}

export interface ISubscriber<State> {
  selector: SelectorSetter<State>;
  ContextProvider: React.FC;
  updater: Updater;
  dirty: boolean;
}

export interface ILiteStoreInstance<State, Action extends Record<string, Function>> {
  state: IRef<State>;
  action: Dispatcher<Action>;
  subscriber: Array<ISubscriber<State> | null>;
  dirty: number | null;
}

export interface ILiteStoreAPI<State, Action extends Record<string, Function>> {
  state: State;
  action: Dispatcher<Action>;
  selector: SelectorSetter<State>;
  ContextProvider: React.FC;
}

export type InitialValue<T> = () => T;

export type ReducerCaller<P> = (
  payload: P,
) => {
  sync(): void;
};

export type Produce<State> = (draft: Draft<State>) => void;

export type CombineReducerCaller<State, ReducersType> = {
  [k in keyof ReducersType]: ReducerCaller<ReducersType[k]>;
} & {
  setState(
    newState: Partial<State> | Produce<State>,
    displayName?: string,
  ): {
    sync(): void;
  };
};

export type CombineReducer<State extends IDefReducer, ReducersType> =
  | ((
    state: State,
  ) => { [k in keyof ReducersType]: Reducer<State, ReducersType[k]> } & {
    setState(newState: Partial<State>): void;
  })
  | ((
    state: State,
  ) => {
    setState(newState: Partial<State>): void;
  });

export type Reducer<State extends IDefReducer, P> = (payload: P) => State;
export type Reducers<State extends IDefReducer, R extends Record<string, any>> = (state: State) => { [k in keyof R]: Reducer<State, R[k]> };

export type Actions<State, Action extends Record<string, Function>, ReducerType> = (
  reducer: CombineReducerCaller<State, ReducerType>,
  getState: () => State,
) => Action;

export interface IRef<State> {
  current: State;
}
