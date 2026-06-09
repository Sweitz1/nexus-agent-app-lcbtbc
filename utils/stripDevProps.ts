import React from 'react';

/** Strip React dev-mode / editor metadata props before they reach native primitives. */
export function stripDevProps<T extends Record<string, any>>(props: T): T {
  const {
    __source, __self, __sourceLocation, __debugSource, __debugOwner, __componentStack,
    __dataContext, __contentSource,
    ...rest
  } = props as any;
  return rest as T;
}

/**
 * HOC that strips dev-mode / editor metadata props (e.g. __dataContext,
 * __contentSource, __sourceLocation) before they reach SVG DOM elements on web.
 * Use this to wrap every Lucide icon import so the warnings stop.
 */
export function withStrippedProps<P extends object>(Component: React.ComponentType<P>) {
  const Wrapped = (props: P) => React.createElement(Component, stripDevProps(props as any) as P);
  Wrapped.displayName = `Stripped(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}
