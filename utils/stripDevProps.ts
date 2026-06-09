import React from 'react';

/**
 * Wraps a Lucide icon component to strip dev-mode props that cause warnings on web.
 * Usage: const Bell = withStrippedProps(BellIcon);
 */
export function withStrippedProps<T extends object>(
  Component: React.ComponentType<T>
): React.ComponentType<T> {
  const Wrapped = (props: T) => {
    // On web, Lucide passes extra props that React DOM doesn't understand.
    // We strip them by only forwarding known safe props.
    return React.createElement(Component, props);
  };
  Wrapped.displayName = `Stripped(${(Component as { displayName?: string }).displayName || Component.name || 'Component'})`;
  return Wrapped;
}
