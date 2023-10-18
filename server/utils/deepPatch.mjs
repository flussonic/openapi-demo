import {isObject} from "./is.mjs";

/**
 * @param {object} source
 * @param {object} delta
 * @return {object}
 */
export const deepPatchRecursive = (source, delta) => {
    return Object.keys(delta).reduce((target, currentIndex) => {
        switch (true) {
            case isObject(source[currentIndex]) && isObject(delta[currentIndex]):
                target[currentIndex] = deepPatchRecursive(source[currentIndex], delta[currentIndex])
                break
            case delta[currentIndex] === null || delta[currentIndex] === undefined:
                delete target[currentIndex];
                break;
            default:
                target[currentIndex] = delta[currentIndex];
                break;
        }

        return target;
    }, source);
}

/**
 * Сливает объекты согласно rfc7386
 * Все свойства перезаписываются, кроме объектов.
 * @see https://datatracker.ietf.org/doc/html/rfc7386#appendix-A
 *
 * @param {object} source
 * @param {object} delta
 * @return {object}
 */
export const deepPatch = (source, delta) => {
    return deepPatchRecursive(structuredClone(source), delta)
}
