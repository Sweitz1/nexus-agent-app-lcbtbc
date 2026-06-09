/** Strip React dev-mode / editor metadata props before they reach native primitives. */
export function stripDevProps<T extends Record<string, any>>(props: T): T {
  const {
    __source, __self, __sourceLocation, __debugSource, __debugOwner, __componentStack,
    __dataContext, __contentSource,
    ...rest
  } = props as any;
  return rest as T;
}
