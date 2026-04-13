/**
 * Creates a debounced version of a function that delays invocation
 * until `delayMs` milliseconds have elapsed since the last call.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Function & { cancel(): void }} Debounced function with cancel method
 */
export function debounce(fn, delayMs) {
  let timerId = null;

  function debounced(...args) {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delayMs);
  }

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}
