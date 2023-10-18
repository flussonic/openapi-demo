import { deepPatch } from '../deepPatch.mjs';

describe('deepPatch', () => {
  it('should delete property', () => {
    const sourceObject = { a: 1, b: 2 };
    const deltaObject = { b: null };
    const expectedResult = { a: 1 };
    const result = deepPatch(sourceObject, deltaObject);

    expect(result).toEqual(expectedResult);
  });

  it('should overwrite multilvl objects', () => {
    const sourceObject = {
      a: {
        b: {
          c: [1, 2, 3],
        },
      },
    };
    const deltaObject = {
      a: {
        b: {
          c: [4, 5],
        },
      },
    };
    const expectedResult = deltaObject;
    const result = deepPatch(sourceObject, deltaObject);

    expect(result).toEqual(expectedResult);
  });

  it('should merge multilvl objects', () => {
    const sourceObject = {
      a: 1,
      b: 2,
      c: {
        d: 99,
      },
    };
    const deltaObject = {
      c: {
        e: 100,
      },
    };
    const expectedResult = {
      a: 1,
      b: 2,
      c: {
        d: 99,
        e: 100,
      },
    };
    const result = deepPatch(sourceObject, deltaObject);

    expect(result).toEqual(expectedResult);
  });
});
