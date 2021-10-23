import isObject from './codegen-functions/is-object.mjs';

function _traverseBody(key, curObj, scope, cb, deps) {
  const value = curObj[key];
  const pos = scope.enter(key);
  const matched = deps !== null && deps.length > 0 && !deps[0].fn(scope);

  if (deps === null || (deps.length === 1 && matched)) {
    cb(scope);
  }

  if (!isObject(value)) {
    // no-op
  } else if (deps === null) {
    _traverse(value, scope, cb, deps);
  } else if (deps.length > 0) {
    if (matched) {
      _traverse(value, scope, cb, deps.slice(1));
    }

    if (deps[0].deep) {
      scope.exit(pos);
      scope.enter(key);
      _traverse(value, scope, cb, deps);
    }
  }

  scope.exit(pos);
}

function _traverse(curObj, scope, cb, deps) {
  if (Array.isArray(curObj)) {
    for (let i = 0; i < curObj.length; i++) {
      _traverseBody(i, curObj, scope, cb, deps);
    }
  } else {
    for (const key of Object.keys(curObj)) {
      _traverseBody(key, curObj, scope, cb, deps);
    }
  }
}

export function traverse(cb) {
  _traverse(this.root, this, cb, null);
}

export function bailedTraverse(cb, deps) {
  _traverse(this.value, this, cb, deps);
}

export function zonedTraverse(cb, zones) {
  if (isSaneObject(this.root)) {
    zonesRegistry.set(this.root, zones);
    _traverse(new Proxy(this.root, traps), this, cb, null);
  } else {
    _traverse(this.root, this, cb, null);
  }
}

const zonesRegistry = new WeakMap();

const traps = {
  get(target, key) {
    if (key === 'length' && Array.isArray(target)) {
      const stored = zonesRegistry.get(target);

      if (stored === void 0) {
        return 0;
      }

      if ('*' in stored) {
        for (const item of target) {
          if (isObject(item)) {
            zonesRegistry.set(item, stored['*']);
          }
        }

        return target.length;
      }

      const keys = Object.keys(stored);

      for (const key of keys) {
        const value = target[key];
        if (isObject(value)) {
          zonesRegistry.set(value, stored[key]);
        }
      }

      return Number.isInteger(Number(keys[keys.length - 1]))
        ? Math.min(target.length, Number(keys[keys.length - 1]) + 1)
        : target.length;
    }

    const value = target[key];
    if (!isObject(value)) {
      return value;
    }

    if (!isSaneObject(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isObject(item)) {
          zonesRegistry.set(item, zonesRegistry.get(value));
        }
      }
    }

    const stored = zonesRegistry.get(value);
    return '**' in stored ? value : new Proxy(value, traps);
  },

  ownKeys(target) {
    const stored = zonesRegistry.get(target);

    if (stored === void 0) {
      return [];
    }

    zonesRegistry.delete(target);

    if ('**' in stored) {
      return Object.keys(target);
    }

    if ('*' in stored) {
      const actualKeys = Object.keys(target);

      for (const key of actualKeys) {
        const value = target[key];
        if (isObject(value)) {
          zonesRegistry.set(value, stored['*']);
        }
      }

      return Array.isArray(target) ? actualKeys.map(Number) : actualKeys;
    }

    const actualKeys = Object.keys(stored);

    for (const key of actualKeys) {
      if (!Object.hasOwnProperty.call(target, key)) {
        actualKeys.splice(actualKeys.indexOf(key), 1);
        continue;
      }

      const value = target[key];
      if (isObject(value)) {
        zonesRegistry.set(value, stored[key]);
      }
    }

    return actualKeys;
  },
};

function isSaneObject(object) {
  return !(
    Object.isFrozen(object) ||
    Object.isSealed(object) ||
    !Object.isExtensible(object)
  );
}
