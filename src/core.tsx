/* eslint-disable no-console */
import * as React from 'react';
import produce from 'immer';
import {
  Actions,
  CombineReducer,
  CombineReducerCaller,
  Dispatcher,
  InitialValue,
  IRef,
  ISubscriber,
  ILiteStoreAPI,
  ILiteStoreInstance,
  Produce,
  Reducers,
  Selector,
  IDefReducer,
} from './types';

import { hasInstance, useRender } from './utils';

// ch: 高阶函数。如果不自己手写reducers的话，那就是默认调用一次reducer.setState 那就是reduce更新全部的state。
// 两种更新方法都会改变原始对象的地址。其实这个也不是组件更新的关键
// ch: 这里使用 immer 的 produce 来实现不可变数据结构处理作为全量state的更新优化：https://immerjs.github.io/immer/zh-CN/
const setState = <State extends IDefReducer>(state: State) => (newState: Partial<State> | Produce<State>) => {
  if (typeof newState === 'function') {
    return produce(state, newState);
  }
  return {
    ...state,
    ...newState,
  };
};

const dummySync = { sync: () => {} };

export class LiteStoreContractor<State extends IDefReducer, Action extends Record<string, Function>, Reducer extends IDefReducer> {
  public readonly instance: Array<ILiteStoreInstance<State, Action> | null> = [];

  public readonly instanceContext: React.Context<number> = React.createContext(-1);

  public readonly reducers!: CombineReducer<State, Reducer>;

  initialState: () => State;

  actions: Actions<State, Action, Reducer>;

  constructor(
    initialState: () => State,
    actions: Actions<State, Action, Reducer>,
    reducers?: Reducers<State, Reducer>,
  ) {
    this.initialState = initialState;
    this.actions = actions;
    this.reducers = (...args) => ({
      ...(reducers ? reducers(...args) : {}),
      setState: setState(...args),
    });
  }

  public useInstance = (instanceIndex: number): ILiteStoreAPI<State, Action> => {
    const targetInstance = this.instance[instanceIndex];
    if (targetInstance != null) {
      return this.useLiteStoreAPI(instanceIndex);
    }
    const newState = {
      current: this.initialState(),
    };
    const newActions = this.bindStore(newState, instanceIndex);
    this.instance[instanceIndex] = {
      state: newState,
      action: newActions,
      subscriber: [],
      dirty: null,
    };
    return this.useLiteStoreAPI(instanceIndex);
  };

  public destroyInstance = (instanceIndex: number) => {
    this.instance[instanceIndex] = null;
  };

  // ch: 每调用一次 useStore 或者 useContextStore 都会调用一次 useLiteStoreAPI
  public useLiteStoreAPI = (instanceIndex: number): ILiteStoreAPI<State, Action> => {
    const target = hasInstance(this.instance, instanceIndex);
    const render = useRender();
    const prevSelect = React.useRef<unknown[]>([]);
    const selectorFn = React.useRef<Selector<State>>();
    const [subscriberIndex] = React.useState(target.subscriber.length);

    React.useEffect(() => {
      return () => {
        target.subscriber[subscriberIndex] = null;
      };
    }, [subscriberIndex, target.subscriber]);

    const newSubscriber = target.subscriber[subscriberIndex];
    let subscriberInstance: ISubscriber<State>;

    if (newSubscriber == null) {
      const selector = (newSelectorFn: Selector<State>) => {
        if (typeof newSelectorFn !== 'function') {
          return;
        }
        selectorFn.current = newSelectorFn;
        const deps = newSelectorFn(target.state.current);
        if (Array.isArray(deps)) {
          prevSelect.current = [...deps];
        }
      };

      const updater = () => {
        if (typeof selectorFn.current !== 'function') {
          // ch: 如果组件里没有调用selector 或者 selector 的参数不是一个function，就渲染
          render();
          return;
        }
        const currentSelect = selectorFn.current(target.state.current);
        // ch: 依赖对象是数组，判断渲染
        // ch: 不是数组，并且不为空，直接渲染
        if (Array.isArray(currentSelect)) {
          const skipRender = prevSelect.current.every((prev, index) => {
            // ch: Object.is 渲染关键指标函数，考虑换成lodash.isEqual 是否性能更佳
            return Object.is(prev, currentSelect[index]);
          });
          if (!skipRender) {
            prevSelect.current = [...currentSelect];
            render();
          }
        } else if (currentSelect) {
          render();
        }
      };

      const { Provider } = this.instanceContext;

      subscriberInstance = {
        selector,
        updater,
        ContextProvider: ({ children }) => <Provider value={instanceIndex}>{children}</Provider>,
        dirty: false,
      };
      // ch: 每次调用useLiteStoreAPI 都会产生一个 subscriberInstance 对象
      target.subscriber[subscriberIndex] = subscriberInstance;
    } else {
      subscriberInstance = newSubscriber;
      subscriberInstance.dirty = false;
    }

    return {
      action: target.action,
      state: target.state.current,
      selector: subscriberInstance.selector,
      ContextProvider: subscriberInstance.ContextProvider,
    };
  };

  private updateComponent = (newState: State, instanceIndex: number, displayName: string, payload: unknown) => {
    const target = hasInstance(this.instance, instanceIndex);
    if (process.env.NODE_ENV !== 'production') {
      console.groupCollapsed(`%c reducer %c${displayName}`, 'color:darkgrey;font-weight:normal', 'font-weight:bold');
      console.log('%c prev state', 'color: darkgrey;font-weight:bold', target.state.current);
      console.log('%c payload', 'color: cornflowerblue;font-weight:bold', payload);
      console.log('%c next state', 'color: darkcyan;font-weight:bold', newState);
      console.groupEnd();
    }

    target.state.current = newState;
    // ch: 遍历所有的监听
    target.subscriber.forEach((subscriber) => {
      if (subscriber != null) {
        // ch: 如果store 实例有监听数组不为空，那么设置 subscriber.dirty = true;
        subscriber.dirty = true;
      }
    });
    const sync = () => {
      target.subscriber.forEach((subscriberInstance) => {
        if (subscriberInstance != null) {
          const { updater, dirty } = subscriberInstance;
          if (dirty) {
            updater();
          }
        }
      });
      target.dirty = null;
    };

    if (target.dirty == null) {
      target.dirty = window.setTimeout(sync);
    }
    return {
      sync,
    };
  };

  // core 根据initialState 返回 一些列的 setState
  private bindReducer = (stateRef: IRef<State>, instanceIndex: number) => {
    return Object.keys(this.reducers(stateRef.current)).reduce<Partial<CombineReducerCaller<State, Reducer>>>(
      (prev, curr) => {
        return {
          ...prev,
          [curr]: (payload: unknown, displayName?: string) => {
            try {
              return this.updateComponent(
                (this.reducers(stateRef.current) as any)[curr](payload),
                instanceIndex,
                displayName ||
                  (curr === 'setState' && typeof payload === 'object' && payload != null
                    ? `setState:${Object.keys(payload).join(',')}`
                    : curr),
                payload,
              );
            } catch (e) {
              // update state failed, maybe updating states in a unmounted store
              return dummySync;
            }
          },
        };
      },
      {},
    ) as CombineReducerCaller<State, Reducer>;
  };

  // 为什么这里需要bind
  private bindAction = (stateRef: IRef<State>, reducers: CombineReducerCaller<State, Reducer>) => {
    const getState = () => stateRef.current;
    const commands = this.actions(reducers, getState);
    Object.keys(commands).forEach((curr: keyof Action) => {
      commands[curr] = commands[curr].bind(commands);
    });
    return commands;
  };

  private bindStore = (stateRef: IRef<State>, instanceIndex: number): Dispatcher<Action> => {
    const ReducerInstance = this.bindReducer(stateRef, instanceIndex);
    return this.bindAction(stateRef, ReducerInstance);
  };
}

export const createStore = <State extends IDefReducer, Reducer extends IDefReducer = {}, Action extends Record<string, Function> = {}>(
  initialState: InitialValue<State>,
  reducer: Reducers<State, Reducer>,
  action: Actions<State, Action, Reducer>,
): LiteStoreContractor<State, Action, Reducer> => {
  return new LiteStoreContractor(initialState, action, reducer);
};

/* istanbul ignore next */
const dummyFunction = () => ({});

export const createStoreWithoutReducer = <State extends IDefReducer, Action extends Record<string, Function> = {}>(
  initialState: InitialValue<State>,
  action: Actions<State, Action, {}>,
): LiteStoreContractor<State, Action, {}> => {
  return new LiteStoreContractor(initialState, action, dummyFunction);
};

export const cloneStore = <State extends IDefReducer, Action extends Record<string, Function>, Reducer extends IDefReducer>(
  liteStore: LiteStoreContractor<State, Action, Reducer>,
) => {
  return new LiteStoreContractor(
    liteStore.initialState,
    liteStore.actions,
    liteStore.reducers as Reducers<State, Reducer>,
  );
};
