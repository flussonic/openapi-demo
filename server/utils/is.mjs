export const isObject = (val) => typeof val === 'object' && !Array.isArray(val) && val !== null;
export const isArray = (val) => Array.isArray(val);
export const isUndefined = (val) => typeof val === 'undefined';
