/**
 * Аллокатор ID для аксессуаров, сервисов, характеристик.
 *
 * База 13 повторяет соглашение из `UnitTest/source/UnitTests.js`
 * (`sId = 13`, `cId = 13`) — так фикстуры из репозитория с явно
 * указанными id 13/14/... остаются совместимыми с автогенерируемыми.
 */
export class IdAllocator {
  private next: number;

  constructor(start = 13) {
    this.next = start;
  }

  allocate(): number {
    return this.next++;
  }

  seen(id: number): void {
    if (id >= this.next) this.next = id + 1;
  }

  reset(start = 13): void {
    this.next = start;
  }
}
