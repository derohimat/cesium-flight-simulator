/**
 * Lightweight, zero-dependency, self-contained test context and assertion harness
 * for running opaque-box E2E test suites in Node.js.
 */

class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

export class TestContext {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      assertions: 0,
      startTime: 0,
      endTime: 0,
    };
  }

  describe(name, fn) {
    const suite = {
      name,
      tests: [],
      beforeAllFns: [],
      afterAllFns: [],
      beforeEachFns: [],
      afterEachFns: [],
    };
    this.suites.push(suite);
    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      this.describe('Default Suite', () => {
        this.currentSuite.tests.push({ name, fn });
      });
    } else {
      this.currentSuite.tests.push({ name, fn });
    }
  }

  it(name, fn) {
    this.test(name, fn);
  }

  // --- Assertions ---

  assert(condition, message = 'Expected truthy condition') {
    this.stats.assertions++;
    if (!condition) {
      throw new AssertionError(message, condition, true);
    }
  }

  strictEqual(actual, expected, message) {
    this.stats.assertions++;
    if (actual !== expected) {
      throw new AssertionError(
        message || `Expected ${JSON.stringify(actual)} to strictly equal ${JSON.stringify(expected)}`,
        actual,
        expected
      );
    }
  }

  notStrictEqual(actual, expected, message) {
    this.stats.assertions++;
    if (actual === expected) {
      throw new AssertionError(
        message || `Expected ${JSON.stringify(actual)} NOT to strictly equal ${JSON.stringify(expected)}`,
        actual,
        expected
      );
    }
  }

  deepStrictEqual(actual, expected, message) {
    this.stats.assertions++;
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      throw new AssertionError(
        message || `Expected deep equality:\nActual:   ${actStr}\nExpected: ${expStr}`,
        actual,
        expected
      );
    }
  }

  closeTo(actual, expected, delta = 1e-4, message) {
    this.stats.assertions++;
    const diff = Math.abs(actual - expected);
    if (diff > delta || Number.isNaN(diff)) {
      throw new AssertionError(
        message || `Expected ${actual} to be close to ${expected} (within ±${delta}, diff: ${diff})`,
        actual,
        expected
      );
    }
  }

  ok(value, message = 'Expected truthy value') {
    this.assert(Boolean(value), message);
  }

  throws(fn, expectedRegexOrMessage) {
    this.stats.assertions++;
    let threw = false;
    let caughtErr = null;
    try {
      fn();
    } catch (err) {
      threw = true;
      caughtErr = err;
    }
    if (!threw) {
      throw new AssertionError('Expected function to throw an error, but it did not.');
    }
    if (expectedRegexOrMessage) {
      const msg = caughtErr?.message || String(caughtErr);
      if (expectedRegexOrMessage instanceof RegExp) {
        if (!expectedRegexOrMessage.test(msg)) {
          throw new AssertionError(
            `Expected error message "${msg}" to match ${expectedRegexOrMessage}`,
            msg,
            expectedRegexOrMessage
          );
        }
      } else if (typeof expectedRegexOrMessage === 'string') {
        if (!msg.includes(expectedRegexOrMessage)) {
          throw new AssertionError(
            `Expected error message "${msg}" to contain "${expectedRegexOrMessage}"`,
            msg,
            expectedRegexOrMessage
          );
        }
      }
    }
  }

  async rejects(promiseOrFn, expectedRegexOrMessage) {
    this.stats.assertions++;
    let threw = false;
    let caughtErr = null;
    try {
      if (typeof promiseOrFn === 'function') {
        await promiseOrFn();
      } else {
        await promiseOrFn;
      }
    } catch (err) {
      threw = true;
      caughtErr = err;
    }
    if (!threw) {
      throw new AssertionError('Expected promise to reject, but it resolved.');
    }
    if (expectedRegexOrMessage) {
      const msg = caughtErr?.message || String(caughtErr);
      if (expectedRegexOrMessage instanceof RegExp) {
        if (!expectedRegexOrMessage.test(msg)) {
          throw new AssertionError(
            `Expected rejection error message "${msg}" to match ${expectedRegexOrMessage}`,
            msg,
            expectedRegexOrMessage
          );
        }
      } else if (typeof expectedRegexOrMessage === 'string') {
        if (!msg.includes(expectedRegexOrMessage)) {
          throw new AssertionError(
            `Expected rejection error message "${msg}" to contain "${expectedRegexOrMessage}"`,
            msg,
            expectedRegexOrMessage
          );
        }
      }
    }
  }

  match(actual, regex, message) {
    this.stats.assertions++;
    if (!regex.test(actual)) {
      throw new AssertionError(
        message || `Expected "${actual}" to match regex ${regex}`,
        actual,
        regex
      );
    }
  }

  // --- Runner ---

  async run() {
    this.stats.startTime = Date.now();
    const results = [];

    for (const suite of this.suites) {
      const suiteResult = {
        name: suite.name,
        tests: [],
      };

      for (const t of suite.tests) {
        this.stats.total++;
        const testStart = Date.now();
        let error = null;
        try {
          await t.fn();
          this.stats.passed++;
        } catch (err) {
          this.stats.failed++;
          error = err;
        }
        const duration = Date.now() - testStart;
        suiteResult.tests.push({
          name: t.name,
          passed: !error,
          error,
          duration,
        });
      }
      results.push(suiteResult);
    }

    this.stats.endTime = Date.now();
    return {
      stats: { ...this.stats, duration: this.stats.endTime - this.stats.startTime },
      results,
    };
  }
}
