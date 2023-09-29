/* eslint-disable react/display-name */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { ILiteStoreInstance } from './types';

const realCompose = (...Comps: React.ComponentType[]) => {
  const [C, ...restC] = Comps;
  return (props: any) => <C>{restC.length === 0 ? props.children : realCompose(...restC)(props)}</C>;
};

export const Compose = (...Comps: Array<React.ComponentType<any>>) => {
  return (props: any) => {
    return realCompose(...Comps)(props);
  };
};

export const hasInstance = <State, Action extends Record<string, Function>>(
  instanceArr: Array<ILiteStoreInstance<State, Action> | null>,
  index: number,
): ILiteStoreInstance<State, Action> => {
  const target = instanceArr[index];
  if (target == null) {
    throw Error('store has not initialized');
  }
  return target;
};

export const useRender = () => {
  const [, set] = React.useState({});
  const isMount = React.useRef(true);
  React.useEffect(
    () => () => {
      isMount.current = false;
    },
    [],
  );
  return React.useCallback(() => {
    if (isMount.current) set({});
  }, []);
};
