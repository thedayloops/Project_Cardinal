export function makeEventLog(keepLast) {
  return {
    keepLast,
    items: [],
    push(evt) {
      this.items.push(evt);
      if (this.items.length > this.keepLast) {
        this.items.splice(0, this.items.length - this.keepLast);
      }
    }
  };
}
