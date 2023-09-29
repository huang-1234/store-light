/* eslint-disable react-hooks/rules-of-hooks,react-hooks/exhaustive-deps */
import * as React from 'react';
import { LiteStoreContractor } from './core';
import { ILiteStoreAPI, Selector } from './types';
import { Compose } from './utils';

const usePropsChanged = (callback: () => void, deps: any[]) => {
  const oldDeps = React.useRef(deps);
  if (oldDeps.current.some((it, i) => !Object.is(it, deps[i]))) {
    callback();
  }
};

export const useStore = <State, Action extends Record<string, Function>, Reducer>(
  liteStore: LiteStoreContractor<State, Action, Reducer>,
): ILiteStoreAPI<State, Action> => {
  const [instanceIndex] = React.useState(liteStore.instance.length);

  usePropsChanged(() => {
    // eslint-disable-next-line no-console
    console.warn('Store instance has been changed, which may cause some unknown error.');
  }, [liteStore, instanceIndex]);

  const store = liteStore.useInstance(instanceIndex);

  if (typeof module !== 'undefined' && module.hot) {
    React.useEffect(() => {
      return () => {
        liteStore.destroyInstance(instanceIndex);
      };
    }, []);
  } else {
    React.useEffect(() => {
      return () => {
        liteStore.destroyInstance(instanceIndex);
      };
    }, [liteStore, instanceIndex]);
  }

  return store;
};

export const useContextStore = <State, Action extends Record<string, Function>, Reducer>(
  liteStore: LiteStoreContractor<State, Action, Reducer>,
): ILiteStoreAPI<State, Action> => {
  const instanceIndex = React.useContext(liteStore.instanceContext);

  usePropsChanged(() => {
    // eslint-disable-next-line no-console
    console.warn('Store instance has been changed, which may cause some unknown error.');
  }, [liteStore, instanceIndex]);

  if (instanceIndex === -1) {
    // eslint-disable-next-line no-console
    console.warn('Can not found store instance, creating.');
    return useStore(liteStore);
  }
  return liteStore.useLiteStoreAPI(instanceIndex);
};

type UseStoreProvider = (...liteStores: Array<LiteStoreContractor<any, any, any>>) => React.ComponentType;

export const useStoreProvider: UseStoreProvider = (...liteStores) => {
  usePropsChanged(() => {
    // eslint-disable-next-line no-console
    console.warn('Imported Store has been changed, which may cause some unknown error.');
  }, liteStores);

  const Providers = liteStores.map((liteStore) => {
    const { ContextProvider, selector } = useStore(liteStore);
    React.useMemo(() => {
      selector(() => false);
    }, [selector]);
    return ContextProvider;
  });

  return React.useMemo(() => {
    return Compose(...Providers);
  }, Providers);
};

export const useMemoStore = <State, Action extends Record<string, Function>, Reducer>(
  liteStore: LiteStoreContractor<State, Action, Reducer>,
  ContextProvider?: React.ComponentType,
) => (render: (state: State) => React.ReactElement, selector: Selector<State>): React.ComponentType => {
  const Children = React.useMemo(
    () => () => {
      const store = useContextStore(liteStore);
      React.useMemo(() => store.selector(selector), [selector]);
      return render(store.state);
    },
    [liteStore],
  );
  if (ContextProvider) {
    return React.useMemo(
      () => () => (
        <ContextProvider>
          <Children />
        </ContextProvider>
      ),
      [liteStore, Children],
    );
  }
  return Children;
};
