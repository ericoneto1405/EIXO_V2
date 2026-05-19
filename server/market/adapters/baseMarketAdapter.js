export class BaseMarketAdapter {
  constructor(name) {
    this.name = name;
  }

  async fetch() {
    throw new Error(`Adapter ${this.name} must implement fetch()`);
  }

  async parse(rawCapture) {
    return rawCapture;
  }

  async normalize(parsedCapture) {
    return parsedCapture;
  }
}
