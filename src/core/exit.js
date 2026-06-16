export class ExitCollector {
  constructor() {
    this._failures = [];
  }

  addFailure(msg) {
    this._failures.push(msg);
  }

  hasFailures() {
    return this._failures.length > 0;
  }

  summarize() {
    if (this._failures.length === 0) return;
    process.stderr.write('\nFailures:\n');
    for (const msg of this._failures) {
      process.stderr.write(`  - ${msg}\n`);
    }
  }

  getFailures() {
    return [...this._failures];
  }
}
